import "server-only";
import { one, q } from "./db.ts";
import { parseIcs } from "./ical.ts";
import { fetchPublic } from "./safe-fetch.ts";
import { logEvent } from "./log.ts";
import { sendEmail, siteUrl } from "./email.ts";
import { todayLocal } from "./dates.ts";
import { channelOf } from "./channels.ts";
import { applyFeedEvents, type FeedResult } from "./channel-res.ts";
import { checkConflicts } from "./conflicts.ts";

/** Tries in a row that must fail before admins are alerted (the hourly job makes one try an hour). */
export const ALERT_AFTER_FAILS = 3;

async function download(url: string): Promise<string> {
  const res = await fetchPublic(url);
  if (!res.ok) throw new Error(`the calendar site answered ${res.status}`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("that link doesn't return a calendar file");
  return text;
}

/** Downloads an Airbnb/Vrbo/Booking.com calendar and updates that feed's reservations and blocked dates. Also used by the scheduled job.
 *  A failed download is retried once straight away; each failure only affects this calendar. After ALERT_AFTER_FAILS failures in a row,
 *  admins are emailed once (and again only after it has worked in between).
 *  Then checks for double bookings and alerts right away (the hourly job checks once after all calendars instead: `checkAfter: false`). */
export async function syncFeed(feedId: string, opts: { checkAfter?: boolean; retryDelayMs?: number } = {}): Promise<{ count: number; error?: string; result?: FeedResult }> {
  const f = await one<{ id: string; property_id: string; name: string; url: string }>("SELECT id, property_id, name, url FROM ical_feeds WHERE id = $1", [feedId]);
  if (!f) return { count: 0, error: "Calendar link not found." };
  try {
    let text: string;
    try { text = await download(f.url); }
    catch { await new Promise(r => setTimeout(r, opts.retryDelayMs ?? 2000)); text = await download(f.url); }
    const events = parseIcs(text);
    const r = await applyFeedEvents(f, channelOf(f.name, f.url).key, events, todayLocal());
    const problem = r.kept || (r.clashes.length ? `Overlaps a Sevgio booking: ${r.clashes.join("; ")}` : null);
    const result = { events: events.filter(e => !e.cancelled).length, added: r.added, updated: r.updated, changed: r.changed, cancelled: r.cancelled };
    await q("UPDATE ical_feeds SET last_synced_at = now(), last_attempt_at = now(), last_error = $2, fail_count = 0, alerted_at = NULL, last_result = $3 WHERE id = $1",
      [f.id, problem, JSON.stringify(result)]);
    if (r.clashes.length) await logEvent("warn", "Calendar sync", `${f.name} has dates that overlap Sevgio bookings`, { feed: f.id, clashes: r.clashes });
    if (r.kept) await logEvent("warn", "Calendar sync", `${f.name}: ${r.kept}`, { feed: f.id });
    if (r.changed || r.cancelled) await logEvent("info", "Calendar sync", `${f.name}: ${r.added} new, ${r.changed} changed dates, ${r.cancelled} cancelled`, { feed: f.id, property: f.property_id });
    if (opts.checkAfter !== false) await checkConflicts();
    return { count: result.events, result: r };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const row = await one<{ fail_count: number; alerted_at: string | null; last_synced_at: string | null; place: string }>(
      `UPDATE ical_feeds f SET last_error = $2, last_attempt_at = now(), fail_count = fail_count + 1 FROM properties p WHERE f.id = $1 AND p.id = f.property_id
       RETURNING f.fail_count, f.alerted_at, f.last_synced_at, p.title AS place`, [f.id, msg]);
    await logEvent("error", "Calendar sync", `Could not import ${f.name}: ${msg}`, { feed: f.id, property: f.property_id });
    if (row && row.fail_count >= ALERT_AFTER_FAILS && !row.alerted_at) await alertFailing(f, row, msg);
    return { count: 0, error: msg };
  }
}

/** Emails admins that a calendar link keeps failing, so blocked dates from that site aren't silently out of date. */
async function alertFailing(f: { id: string; name: string }, row: { fail_count: number; last_synced_at: string | null; place: string }, msg: string) {
  await q("UPDATE ical_feeds SET alerted_at = now() WHERE id = $1", [f.id]);
  const admins = await q<{ email: string }>("SELECT email FROM users WHERE role = 'admin'");
  const last = row.last_synced_at ? new Date(row.last_synced_at).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) : "never";
  const subject = `Calendar sync failing: ${f.name} for ${row.place}`;
  const text = [`Sevgio couldn't read the ${f.name} calendar link for ${row.place} ${row.fail_count} times in a row.`, `Error: ${msg}`, `Last successful sync: ${last}.`, "",
    "Until it works again, new bookings and cancellations on that site won't reach Sevgio's calendar. Check the link on the site, then press Sync now:",
    siteUrl() + "/admin/calendar-sync"].join("\n");
  const sent = await Promise.all(admins.map(a => sendEmail(a.email, subject, text)));
  await logEvent("warn", "Calendar sync", subject, { feed: f.id, emailed: sent.filter(r => r.ok).length });
}

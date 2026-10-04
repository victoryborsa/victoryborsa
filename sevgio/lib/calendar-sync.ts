import "server-only";
import { one, q } from "./db.ts";
import { parseIcs } from "./ical.ts";
import { fetchPublic } from "./safe-fetch.ts";
import { logEvent } from "./log.ts";
import { todayLocal } from "./dates.ts";
import { channelOf } from "./channels.ts";
import { applyFeedEvents, type FeedResult } from "./channel-res.ts";

/** Downloads an Airbnb/Vrbo/Booking.com calendar and updates that feed's reservations and blocked dates. Also used by the scheduled job. */
export async function syncFeed(feedId: string): Promise<{ count: number; error?: string; result?: FeedResult }> {
  const f = await one<{ id: string; property_id: string; name: string; url: string }>("SELECT id, property_id, name, url FROM ical_feeds WHERE id = $1", [feedId]);
  if (!f) return { count: 0, error: "Calendar link not found." };
  try {
    const res = await fetchPublic(f.url);
    if (!res.ok) throw new Error(`the calendar site answered ${res.status}`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("that link doesn't return a calendar file");
    const events = parseIcs(text);
    const r = await applyFeedEvents(f, channelOf(f.name, f.url).key, events, todayLocal());
    const problem = r.kept || (r.clashes.length ? `Overlaps a Sevgio booking: ${r.clashes.join("; ")}` : null);
    await q("UPDATE ical_feeds SET last_synced_at = now(), last_error = $2 WHERE id = $1", [f.id, problem]);
    if (r.clashes.length) await logEvent("warn", "Calendar sync", `${f.name} has dates that overlap Sevgio bookings`, { feed: f.id, clashes: r.clashes });
    if (r.kept) await logEvent("warn", "Calendar sync", `${f.name}: ${r.kept}`, { feed: f.id });
    if (r.changed || r.cancelled) await logEvent("info", "Calendar sync", `${f.name}: ${r.added} new, ${r.changed} changed dates, ${r.cancelled} cancelled`, { feed: f.id, property: f.property_id });
    return { count: events.filter(e => !e.cancelled).length, result: r };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await q("UPDATE ical_feeds SET last_error = $2 WHERE id = $1", [f.id, msg]);
    await logEvent("error", "Calendar sync", `Could not import ${f.name}: ${msg}`, { feed: f.id, property: f.property_id });
    return { count: 0, error: msg };
  }
}

import "server-only";
import { one, q } from "./db.ts";
import { replaceFeedBlocks } from "./bookings.ts";
import { parseIcs } from "./ical.ts";
import { fetchPublic } from "./safe-fetch.ts";
import { logEvent } from "./log.ts";
import { todayLocal } from "./dates.ts";

/** Downloads an Airbnb/Vrbo/Booking.com calendar and replaces that feed's blocked dates. Also used by the scheduled job. */
export async function syncFeed(feedId: string): Promise<{ count: number; error?: string }> {
  const f = await one<{ id: string; property_id: string; name: string; url: string }>("SELECT id, property_id, name, url FROM ical_feeds WHERE id = $1", [feedId]);
  if (!f) return { count: 0, error: "Calendar link not found." };
  try {
    const res = await fetchPublic(f.url);
    if (!res.ok) throw new Error(`the calendar site answered ${res.status}`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("that link doesn't return a calendar file");
    const today = todayLocal();
    const events = parseIcs(text).filter(e => e.end > today);
    const clashes = await replaceFeedBlocks(f.property_id, "ical:" + f.id, events.map(e => ({ start: e.start < today ? today : e.start, end: e.end, note: `${f.name}: ${e.summary}` })));
    await q("UPDATE ical_feeds SET last_synced_at = now(), last_error = $2 WHERE id = $1", [f.id, clashes.length ? `Overlaps a Sevgio Stays booking: ${clashes.join("; ")}` : null]);
    if (clashes.length) await logEvent("warn", "Calendar sync", `${f.name} has dates that overlap Sevgio Stays bookings`, { feed: f.id, clashes });
    return { count: events.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await q("UPDATE ical_feeds SET last_error = $2 WHERE id = $1", [f.id, msg]);
    await logEvent("error", "Calendar sync", `Could not import ${f.name}: ${msg}`, { feed: f.id, property: f.property_id });
    return { count: 0, error: msg };
  }
}


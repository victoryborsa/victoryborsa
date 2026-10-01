import "server-only";
import { one, q } from "./db.ts";
import { fetchPublic } from "./safe-fetch.ts";
import { addDays, todayLocal } from "./dates.ts";
import { logEvent } from "./log.ts";
import { CATEGORIES, TEAMS, parseEventIcs, teamOf, timeLabel } from "./events-ics.ts";

export { CATEGORIES, TEAMS, parseEventIcs, teamOf, timeLabel };

export type Ev = {
  id: string; source: string; title: string; local_date: string; end_date: string | null; local_time: string; venue: string; category: string;
  team: string | null; image_url: string; url: string; featured: boolean; free: boolean; hidden: boolean; photo_id: string | null;
};

// Ticket add-ons that aren't events in their own right.
const NOT_AN_EVENT = /parking|not a game ticket|club pass|suite|upgrade|voucher|gift card|season ticket/i;

const SEGMENT: Record<string, string> = { Sports: "Sports", Music: "Music", "Arts & Theatre": "Arts & Theatre", Film: "Arts & Theatre", Family: "Family" };

const PGH = { lat: 40.4406, lng: -79.9959 };

/** Pulls the next 4 months of events within 25 miles of downtown from the Ticketmaster Discovery API. */
export async function syncTicketmaster(): Promise<{ count: number; error?: string }> {
  const key = (process.env.TICKETMASTER_API_KEY || "").trim();
  if (!key) return { count: 0, error: "not-configured" };
  const started = new Date();
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const from = fmt(new Date(Date.now() - 6 * 3600_000)), to = fmt(new Date(Date.now() + 120 * 86400_000));
  let count = 0;
  try {
    for (let page = 0; page < 5; page++) {
      const base = (process.env.TICKETMASTER_BASE || "https://app.ticketmaster.com").replace(/\/$/, "");
      const url = `${base}/discovery/v2/events.json?` + new URLSearchParams({
        apikey: key, latlong: `${PGH.lat},${PGH.lng}`, radius: "25", unit: "miles", size: "200", page: String(page), sort: "date,asc",
        startDateTime: from, endDateTime: to, locale: "*",
      });
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { Accept: "application/json" } });
      if (res.status === 401) throw new Error("Ticketmaster refused the API key");
      if (!res.ok) throw new Error(`Ticketmaster answered ${res.status}`);
      const data = await res.json() as TmPage;
      for (const e of data._embedded?.events ?? []) if (await upsertTm(e)) count++;
      if (page + 1 >= (data.page?.totalPages ?? 0)) break;
      await new Promise(r => setTimeout(r, 250)); // stay well under the 5 requests/second limit
    }
    // Events Ticketmaster no longer lists (cancelled, moved) disappear.
    await q("DELETE FROM events WHERE source = 'ticketmaster' AND updated_at < $1 AND local_date >= $2", [started, todayLocal()]);
    return { count };
  } catch (e) {
    await logEvent("error", "Events", "Ticketmaster sync failed", { error: String(e) });
    return { count, error: String(e) };
  }
}

type TmEvent = {
  id: string; name: string; url?: string;
  images?: { url: string; width: number; ratio?: string }[];
  dates?: { start?: { localDate?: string; localTime?: string; dateTBA?: boolean; timeTBA?: boolean }; status?: { code?: string } };
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[];
  _embedded?: { venues?: { name?: string }[] };
};
type TmPage = { _embedded?: { events?: TmEvent[] }; page?: { totalPages?: number } };

async function upsertTm(e: TmEvent): Promise<boolean> {
  const date = e.dates?.start?.localDate;
  if (!date || NOT_AN_EVENT.test(e.name) || e.dates?.status?.code === "cancelled") return false;
  const imgs = (e.images ?? []).filter(i => i.ratio === "16_9").sort((a, b) => a.width - b.width);
  const image = (imgs.find(i => i.width >= 640) ?? imgs[imgs.length - 1] ?? e.images?.[0])?.url ?? "";
  const seg = e.classifications?.[0]?.segment?.name ?? "";
  const genre = e.classifications?.[0]?.genre?.name ?? "";
  const category = SEGMENT[seg] ?? (/festival/i.test(genre + e.name) ? "Festivals" : "Other");
  const time = e.dates?.start?.timeTBA ? "" : (e.dates?.start?.localTime ?? "").slice(0, 5);
  await q(
    `INSERT INTO events (source, source_id, title, local_date, local_time, venue, category, team, image_url, url, updated_at)
     VALUES ('ticketmaster', $1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (source, source_id) WHERE source <> 'manual' DO UPDATE SET title = EXCLUDED.title, local_date = EXCLUDED.local_date, local_time = EXCLUDED.local_time,
       venue = EXCLUDED.venue, category = EXCLUDED.category, team = EXCLUDED.team, image_url = EXCLUDED.image_url, url = EXCLUDED.url, updated_at = now()`,
    [e.id, e.name.slice(0, 200), date, time, (e._embedded?.venues?.[0]?.name ?? "").slice(0, 120), category, teamOf(e.name), image, e.url ?? ""],
  );
  return true;
}

/** Reads events from a calendar (.ics) link, e.g. a team schedule or a venue's calendar. */
export async function syncEventFeed(feedId: string): Promise<{ count: number; error?: string }> {
  const feed = await one<{ id: string; name: string; url: string; category: string }>("SELECT id, name, url, category FROM event_feeds WHERE id = $1", [feedId]);
  if (!feed) return { count: 0, error: "not found" };
  try {
    const res = await fetchPublic(feed.url);
    if (!res.ok) throw new Error(`the calendar answered ${res.status}`);
    const items = parseEventIcs(await res.text());
    const today = todayLocal(), last = addDays(today, 400);
    const started = new Date();
    let count = 0;
    for (const it of items) {
      if ((it.end || it.date) < today || it.date > last) continue;
      await q(
        `INSERT INTO events (source, source_id, feed_id, title, local_date, end_date, local_time, venue, category, team, url, updated_at)
         VALUES ('feed', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT (source, source_id) WHERE source <> 'manual' DO UPDATE SET title = EXCLUDED.title, local_date = EXCLUDED.local_date, end_date = EXCLUDED.end_date,
           local_time = EXCLUDED.local_time, venue = EXCLUDED.venue, category = EXCLUDED.category, team = EXCLUDED.team, url = EXCLUDED.url, updated_at = now()`,
        [`${feed.id}:${it.uid}:${it.date}`, feed.id, it.title.slice(0, 200), it.date, it.end && it.end > it.date ? it.end : null, it.time, it.venue.slice(0, 120), feed.category, teamOf(it.title) ?? teamOf(feed.name), it.url],
      );
      count++;
    }
    await q("DELETE FROM events WHERE feed_id = $1 AND updated_at < $2", [feed.id, started]);
    await q("UPDATE event_feeds SET last_synced_at = now(), last_error = NULL WHERE id = $1", [feed.id]);
    return { count };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 200);
    await q("UPDATE event_feeds SET last_synced_at = now(), last_error = $2 WHERE id = $1", [feed.id, msg]);
    await logEvent("warn", "Events", `Could not read the ${feed.name} calendar: ${msg}`, { feed: feed.id });
    return { count: 0, error: msg };
  }
}

/** Syncs everything at most every 3 hours (called by the hourly cron). */
export async function syncAllEvents(force = false) {
  const last = await one<{ value: unknown }>("SELECT value FROM settings WHERE key = 'events_synced_at'");
  if (!force && last && Date.now() - Number(last.value) < 3 * 3600_000) return { skipped: true };
  await q("INSERT INTO settings (key, value) VALUES ('events_synced_at', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify(Date.now())]);
  const tm = await syncTicketmaster();
  const feeds = await q<{ id: string }>("SELECT id FROM event_feeds");
  let feedEvents = 0;
  for (const f of feeds) feedEvents += (await syncEventFeed(f.id)).count;
  return { ticketmaster: tm.count, ticketmasterError: tm.error, feeds: feeds.length, feedEvents };
}

export async function eventsBetween(from: string, to: string, f: { category?: string; team?: string; includeHidden?: boolean } = {}) {
  return q<Ev>(
    `SELECT e.id, e.source, e.title, e.local_date::text, e.end_date::text, e.local_time, e.venue, e.category, e.team, e.image_url, e.url, e.featured, e.free, e.hidden,
            (SELECT ph.id FROM site_photos ph WHERE ph.slot = 'event:' || e.id::text) AS photo_id
     FROM events e
     WHERE e.local_date < $2 AND coalesce(e.end_date, e.local_date) >= $1 AND ($3 OR NOT e.hidden)
       AND ($4 = '' OR e.category = $4) AND ($5 = '' OR e.team = $5)
     ORDER BY greatest(e.local_date, $1::date), e.featured DESC, nullif(e.local_time, ''), e.title LIMIT 600`,
    [from, to, !!f.includeHidden, f.category || "", f.team || ""],
  );
}


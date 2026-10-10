import { one, q } from "./db.ts";
import { channelOf } from "./channels.ts";
import type { User } from "./auth.ts";

export type FeedHealth = {
  id: string; name: string; url: string; property_id: string; place: string; site: string; channel: string;
  last_synced_at: string | null; last_attempt_at: string | null; last_error: string | null; fail_count: number; alerted_at: string | null;
  last_result: { events?: number; added?: number; updated?: number; changed?: number; cancelled?: number };
  state: "ok" | "warning" | "failing" | "never";
};

/** Calendar links this person manages, with how their syncs are going. */
export async function syncHealth(u: User): Promise<FeedHealth[]> {
  const rows = await q<Omit<FeedHealth, "site" | "channel" | "state">>(
    `SELECT f.id, f.name, f.url, f.property_id, coalesce(hp.title || ' › ' || p.title, p.title) AS place, f.last_synced_at, f.last_attempt_at, f.last_error, f.fail_count, f.alerted_at, f.last_result
     FROM ical_feeds f JOIN properties p ON p.id = f.property_id LEFT JOIN properties hp ON hp.id = p.parent_id
     WHERE ${u.role === "admin" ? "TRUE" : "(p.host_id = $1 OR p.parent_id IN (SELECT id FROM properties WHERE host_id = $1))"}
     ORDER BY f.fail_count DESC, place, f.name`, u.role === "admin" ? [] : [u.id]);
  return rows.map(r => {
    const c = channelOf(r.name, r.url);
    const state = r.fail_count > 0 ? "failing" : !r.last_synced_at ? "never" : r.last_error ? "warning" : "ok";
    return { ...r, site: c.label, channel: c.key, state };
  });
}

/** When the hourly job next runs: an hour after its last run (it starts on the next site visit or cron call after that). */
export async function nextScheduledSync(): Promise<Date | null> {
  const r = await one<{ v: string }>("SELECT value #>> '{}' AS v FROM settings WHERE key = 'jobs_last_run'");
  const last = Number(r?.v);
  if (!last) return null;
  const next = new Date(last + 60 * 60_000);
  return next.getTime() < Date.now() ? new Date() : next;
}

/** How many calendar links this person manages are failing, for the menu badge. */
export async function failingFeedCount(u: User): Promise<number> {
  return (await syncHealth(u)).filter(f => f.state === "failing").length;
}

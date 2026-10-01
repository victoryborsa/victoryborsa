import { q } from "./db.ts";
import { addDays, todayLocal } from "./dates.ts";
import { buildDemand, type Demand } from "./smart-pricing.ts";

/** Demand in Pittsburgh by date (events from the Events page, plus holidays), from `from` up to (not including) `to`. */
export async function demandBetween(from = todayLocal(), to = addDays(from, 548)): Promise<Demand> {
  const rows = await q<{ local_date: string; end_date: string | null; title: string; team: string | null; featured: boolean }>(
    `SELECT local_date::text, end_date::text, title, team, featured FROM events
      WHERE NOT hidden AND local_date < $2 AND coalesce(end_date, local_date) >= $1 ORDER BY local_date, featured DESC`,
    [from, to],
  );
  const events = rows.flatMap(r => {
    // A festival over several days counts on each day (up to a week).
    const days = [r.local_date];
    if (r.end_date && r.end_date > r.local_date) for (let d = addDays(r.local_date, 1); d <= r.end_date && days.length < 7; d = addDays(d, 1)) days.push(d);
    return days.map(date => ({ date, title: r.title, team: r.team, featured: r.featured }));
  });
  return buildDemand(events, from, to);
}

/** Only what the browser needs for live prices: dates with extra demand and their percent. */
export function demandForClient(d: Demand): Demand {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v.pct !== 0).map(([k, v]) => [k, { pct: v.pct, reasons: [], notable: false }]));
}

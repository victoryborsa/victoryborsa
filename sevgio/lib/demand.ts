import { q, type Db } from "./db.ts";
import { addDays, todayLocal } from "./dates.ts";
import { buildDemand, pricedByNight, type Demand, type SmartListing } from "./smart-pricing.ts";

/** Demand in Pittsburgh by date (events from the Events page, holidays, and how full Sevgio's homes are), from `from` up to (not including) `to`. */
export async function demandBetween(from = todayLocal(), to = addDays(from, 548), db?: Db): Promise<Demand> {
  const [rows, busy] = await Promise.all([
    q<{ local_date: string; end_date: string | null; title: string; team: string | null; featured: boolean; category: string; venue: string }>(
      `SELECT local_date::text, end_date::text, title, team, featured, category, venue FROM events
        WHERE NOT hidden AND local_date < $2 AND coalesce(end_date, local_date) >= $1 ORDER BY local_date, featured DESC`,
      [from, to], db,
    ),
    busyShares(from, to, db),
  ]);
  const events = rows.flatMap(r => {
    // A festival over several days counts on each day (up to a week).
    const days = [r.local_date];
    if (r.end_date && r.end_date > r.local_date) for (let d = addDays(r.local_date, 1); d <= r.end_date && days.length < 7; d = addDays(d, 1)) days.push(d);
    return days.map(date => ({ date, title: r.title, team: r.team, featured: r.featured, category: r.category, venue: r.venue }));
  });
  return buildDemand(events, from, to, busy);
}

/** Share of Sevgio's bookable homes and rooms already taken each upcoming night (Sevgio bookings and other sites).
 *  Only counted with 3 or more listings, so one booking doesn't look like a citywide rush. */
async function busyShares(from: string, to: string, db?: Db): Promise<Record<string, number>> {
  const start = from < todayLocal() ? todayLocal() : from;
  if (start >= to) return {};
  const rows = await q<{ night: string; busy: number; total: number }>(
    `WITH units AS (SELECT id, parent_id FROM properties WHERE status = 'published' AND NOT corp_lease_only),
          stays AS (SELECT property_id, check_in, check_out FROM bookings WHERE status IN ('pending','awaiting_payment','confirmed') AND check_out > $1 AND check_in < $2
                    UNION ALL
                    SELECT property_id, check_in, check_out FROM channel_stays WHERE eff_kind <> 'mirror' AND status = 'confirmed' AND check_out > $1 AND check_in < $2)
     SELECT d::date::text AS night, count(DISTINCT u.id)::int AS busy, (SELECT count(*) FROM units)::int AS total
       FROM generate_series($1::date, $2::date - 1, interval '1 day') d
       JOIN stays s ON s.check_in <= d::date AND d::date < s.check_out
       JOIN units u ON u.id = s.property_id OR u.parent_id = s.property_id
      GROUP BY d`,
    [start, to], db,
  );
  return Object.fromEntries(rows.filter(r => r.total >= 3).map(r => [r.night, r.busy / r.total]));
}

/** Only what the browser needs for live prices: dates with extra demand and their percent. */
export function demandForClient(d: Demand): Demand {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v.pct !== 0).map(([k, v]) => [k, { pct: v.pct, reasons: [], notable: false }]));
}

/** Nights the host priced by hand, per listing: { listingId: { "2026-11-08": 15000 } }. */
export async function manualPrices(ids: string[], from: string, to: string, db?: Db): Promise<Record<string, Record<string, number>>> {
  if (!ids.length) return {};
  const rows = await q<{ property_id: string; night: string; price_cents: number }>(
    "SELECT property_id, night::text, price_cents FROM night_prices WHERE property_id = ANY($1) AND night >= $2 AND night < $3", [ids, from, to], db);
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.property_id] ??= {})[r.night] = r.price_cents;
  return out;
}

/** Loads what a listing's night-by-night prices need (demand for Smart Pricing, nights priced by hand) onto it,
 *  so the calendar, the search results, checkout and the saved booking all price each night the same way.
 *  Inside a transaction, pass its client (`db`) so the lookups don't wait for a second connection. */
export async function withNightPricing<T extends SmartListing & { id: string }>(p: T, from: string, to: string, db?: Db): Promise<T> {
  const prices = (await manualPrices([p.id], from, to, db))[p.id];
  if (prices) p.prices = prices;
  if (p.smart_pricing) p.demand = await demandBetween(from, to, db);
  return p;
}

export { pricedByNight };

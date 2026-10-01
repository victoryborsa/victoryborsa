// Smart pricing: each night's price moves with demand in Pittsburgh (events, holidays, weekends),
// starting from the listing's normal nightly price and kept between the host's minimum and maximum.
// Pure functions only, so the browser preview and the saved booking always agree.
import { addDays } from "./dates.ts";

/** Extra demand on a date, in percent, and why. Only dates with something going on are listed. */
export type DemandDay = { pct: number; reasons: string[]; notable: boolean };
export type Demand = Record<string, DemandDay>;

export const WEEKEND_PCT = 10;        // Friday and Saturday nights
export const HOLIDAY_PCT = 15;
export const LAST_MINUTE_PCT = -10;   // nights within the next 3 days that are still empty
export const MAX_EVENT_PCT = 40;

/** How much an event pushes demand up: Steelers games fill the city, other big games and featured events less. */
export function eventWeight(e: { team: string | null; featured: boolean }): number {
  if (e.team === "steelers") return 30;
  if (e.team) return 10;
  if (e.featured) return 15;
  return 3;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
/** The nth weekday (0 = Sunday) of a month; n = -1 for the last one. */
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return iso(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
  return iso(y, m, lastDay - ((last - weekday + 7) % 7));
}

/** Busy holiday nights for travel, by date. */
export function holidays(year: number): Record<string, string> {
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const memorial = nthWeekday(year, 5, 1, -1), labor = nthWeekday(year, 9, 1, 1);
  return {
    [iso(year, 1, 1)]: "New Year's Day",
    [addDays(memorial, -2)]: "Memorial Day weekend", [addDays(memorial, -1)]: "Memorial Day weekend",
    [iso(year, 7, 3)]: "Fourth of July", [iso(year, 7, 4)]: "Fourth of July",
    [addDays(labor, -2)]: "Labor Day weekend", [addDays(labor, -1)]: "Labor Day weekend",
    [addDays(thanksgiving, -1)]: "Thanksgiving", [thanksgiving]: "Thanksgiving", [addDays(thanksgiving, 1)]: "Thanksgiving weekend",
    [iso(year, 12, 24)]: "Christmas Eve", [iso(year, 12, 25)]: "Christmas Day", [iso(year, 12, 31)]: "New Year's Eve",
  };
}

/** Builds the demand list from events and holidays. Events are { date, title, team, featured }. */
export function buildDemand(events: { date: string; title: string; team: string | null; featured: boolean }[], from: string, to: string): Demand {
  const out: Demand = {};
  const day = (d: string) => (out[d] ??= { pct: 0, reasons: [], notable: false });
  const eventPct: Record<string, number> = {};
  for (const e of events) {
    if (e.date < from || e.date >= to) continue;
    const w = eventWeight(e);
    eventPct[e.date] = (eventPct[e.date] || 0) + w;
    const d = day(e.date);
    if (w >= 10) d.notable = true;
    if (d.reasons.length < 4) d.reasons.push(e.title);
  }
  for (const [d, pct] of Object.entries(eventPct)) {
    out[d].pct += Math.min(MAX_EVENT_PCT, pct);
    if (pct >= 10) out[d].notable = true; // several smaller events add up to a busy day
  }
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const [d, name] of Object.entries(holidays(y))) {
      if (d < from || d >= to) continue;
      const x = day(d);
      x.pct += HOLIDAY_PCT;
      x.notable = true;
      x.reasons.unshift(name);
    }
  }
  return out;
}

export type SmartListing = { nightly_price_cents: number; smart_pricing?: boolean; min_price_cents?: number | null; max_price_cents?: number | null; demand?: Demand };

/** The price for one night (the night that starts on `date`), before guest-count changes. */
export function nightPrice(p: SmartListing, date: string, today: string): number {
  const base = p.nightly_price_cents;
  if (!p.smart_pricing) return base;
  let pct = p.demand?.[date]?.pct || 0;
  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  if (dow === 5 || dow === 6) pct += WEEKEND_PCT;
  if (date >= today && date <= addDays(today, 2) && pct < HOLIDAY_PCT) pct += LAST_MINUTE_PCT;
  const min = p.min_price_cents || 0, max = p.max_price_cents || Number.MAX_SAFE_INTEGER;
  const raw = Math.round((base * (100 + pct)) / 100 / 100) * 100; // whole dollars
  return Math.max(min, Math.min(max, raw));
}

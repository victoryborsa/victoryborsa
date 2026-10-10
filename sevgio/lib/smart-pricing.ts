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

export type DemandEvent = { date: string; title: string; team: string | null; featured: boolean; category?: string; venue?: string };

// Pittsburgh's big venues: a sold-out stadium or arena show fills hotels across the city.
const STADIUM = /acrisure|heinz field|pnc park/i;
const ARENA = /ppg paints|petersen events|convention center/i;

/** A team's road game (e.g. "Steelers at Ravens" from a team schedule feed) brings no visitors to Pittsburgh.
 *  A game at a Pittsburgh stadium or arena is always a home game, whatever the title says. */
export function isAwayGame(e: { title: string; team: string | null; venue?: string }): boolean {
  if (!e.team || STADIUM.test(e.venue || "") || ARENA.test(e.venue || "") || /\s(at|@)\s+(acrisure|heinz|pnc|ppg)/i.test(e.title)) return false;
  return new RegExp(`${e.team}\\b.*\\s(at|@)\\s`, "i").test(e.title);
}

/** How much an event pushes demand up, in percent: Steelers games fill the city; Penguins and Pirates games,
 *  stadium and arena concerts and featured events less; anything else only a little. */
export function eventWeight(e: Omit<DemandEvent, "date">): number {
  if (e.team) {
    if (isAwayGame(e)) return 0;
    return e.team === "steelers" ? 30 : e.team === "penguins" ? 12 : 8;
  }
  const venue = e.venue || "";
  if (e.category === "Music" && STADIUM.test(venue)) return 25;
  if (STADIUM.test(venue) || (e.category === "Music" && ARENA.test(venue))) return 15;
  if (e.featured) return 15;
  return 3;
}

/** Nights when most Sevgio homes are already taken: guests are looking for those dates, so prices go up a little. */
export const BUSY_PCT = [{ share: 0.8, pct: 10 }, { share: 0.6, pct: 5 }];
export const GAME_EVE_PCT = 15; // the night before a Steelers home game: fans from out of town arrive the day before

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

/** Builds the demand list from events, holidays and how full Sevgio's homes already are (`busy`: share of homes taken, by night). */
export function buildDemand(events: DemandEvent[], from: string, to: string, busy: Record<string, number> = {}): Demand {
  const out: Demand = {};
  const day = (d: string) => (out[d] ??= { pct: 0, reasons: [], notable: false });
  const eventPct: Record<string, number> = {};
  const add = (date: string, w: number, reason: string) => {
    if (date < from || date >= to || w <= 0) return;
    eventPct[date] = (eventPct[date] || 0) + w;
    const d = day(date);
    if (w >= 10) d.notable = true;
    if (d.reasons.length < 4) d.reasons.push(reason);
  };
  for (const e of events) {
    const w = eventWeight(e);
    add(e.date, w, e.title);
    if (e.team === "steelers" && w > 0) add(addDays(e.date, -1), GAME_EVE_PCT, `Night before ${e.title}`);
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
  for (const [d, share] of Object.entries(busy)) {
    const step = BUSY_PCT.find(b => share >= b.share);
    if (!step || d < from || d >= to) continue;
    const x = day(d);
    x.pct += step.pct;
    x.reasons.push(`${Math.round(share * 100)}% of Sevgio homes booked`);
  }
  return out;
}

/** `prices`: nights the host priced by hand (date → cents). They win over the normal price and Smart Pricing. */
export type SmartListing = { nightly_price_cents: number; smart_pricing?: boolean; min_price_cents?: number | null; max_price_cents?: number | null; demand?: Demand; prices?: Record<string, number> };

/** The price for one night (the night that starts on `date`), before guest-count changes. */
export function nightPrice(p: SmartListing, date: string, today: string): number {
  const manual = p.prices?.[date];
  if (manual) return manual;
  const base = p.nightly_price_cents;
  if (!p.smart_pricing) return base;
  let pct = p.demand?.[date]?.pct || 0;
  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  if (dow === 5 || dow === 6) pct += WEEKEND_PCT;
  if (isLastMinute(date, today) && pct < HOLIDAY_PCT) pct += LAST_MINUTE_PCT;
  // The host's lowest and highest prices are firm limits for every automatic change.
  const min = p.min_price_cents || 0, max = p.max_price_cents || Number.MAX_SAFE_INTEGER;
  const raw = Math.round((base * (100 + pct)) / 100 / 100) * 100; // whole dollars
  return Math.max(min, Math.min(max, raw));
}

/** Tonight and the next two nights: still empty this close in, so they get the last-minute discount. */
export const isLastMinute = (date: string, today: string) => date >= today && date <= addDays(today, 2);

/** Why a night costs what it does, for the host's calendar. */
export function priceWhy(p: SmartListing, date: string, today: string): string {
  if (p.prices?.[date]) return "Price you set for this night";
  if (!p.smart_pricing) return "Your normal nightly price";
  const bits = [...(p.demand?.[date]?.reasons ?? [])];
  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  if (dow === 5 || dow === 6) bits.push("Weekend");
  if (isLastMinute(date, today) && (p.demand?.[date]?.pct || 0) + (dow === 5 || dow === 6 ? WEEKEND_PCT : 0) < HOLIDAY_PCT) bits.push("Last-minute discount");
  const price = nightPrice(p, date, today);
  if (p.min_price_cents && price === p.min_price_cents) bits.push("Held at your lowest price");
  if (p.max_price_cents && price === p.max_price_cents) bits.push("Held at your highest price");
  return "Smart Pricing" + (bits.length ? ": " + bits.join(" · ") : ": normal demand");
}

/** True when nights can cost different amounts (Smart Pricing, or nights priced by hand). */
export const pricedByNight = (p: SmartListing) => !!p.smart_pricing || !!(p.prices && Object.keys(p.prices).length);

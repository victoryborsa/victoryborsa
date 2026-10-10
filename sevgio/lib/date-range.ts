/**
 * The rules behind every date picker on the site (search, listings, booking, host and admin forms),
 * kept in one place so check-in / check-out behave the same everywhere.
 *
 * Dates are "YYYY-MM-DD". `taken` holds nights that can't be booked: a stay can't include them,
 * but a guest may check out on the morning of a taken night.
 */
export type Phase = "ci" | "co";
export type RangeRules = {
  /** First selectable date. Leave empty to allow past dates (reports, payouts). */
  min?: string;
  max?: string;
  taken?: ReadonlySet<string>;
  /** Shortest stay. 1 = check-out at least the next day (stays). 0 = same day allowed (events, inclusive "last day"). */
  minNights?: number;
  maxNights?: number;
};
export type Range = { ci: string; co: string };

export const addDays = (s: string, n: number) => new Date(Date.parse(s + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
export const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

const inBounds = (d: string, r: RangeRules) => (!r.min || d >= r.min) && (!r.max || d <= r.max);

/** Can a stay start on `d`? */
export function canCheckIn(d: string, r: RangeRules) {
  return inBounds(d, r) && !r.taken?.has(d);
}

/** Can a stay that starts on `ci` end on `d`? Never before check-in, never across a taken night. */
export function canCheckOut(ci: string, d: string, r: RangeRules) {
  const min = r.minNights ?? 1;
  const n = nightsBetween(ci, d);
  if (n < min || (r.maxNights && n > r.maxNights) || (r.max && d > r.max)) return false;
  if (r.taken) for (let x = ci; x < d; x = addDays(x, 1)) if (r.taken.has(x)) return false;
  return true;
}

/**
 * The latest check-out a stay starting on `ci` can have, and why: the next booked night, the home's
 * longest stay, or the last date the picker allows. Empty when nothing limits it.
 */
export function checkoutLimit(ci: string, r: RangeRules): { last: string; why: "booked" | "max-nights" | "max"; bookedTo?: string } | null {
  if (!isDate(ci)) return null;
  const caps: { last: string; why: "booked" | "max-nights" | "max"; bookedTo?: string }[] = [];
  if (r.maxNights) caps.push({ last: addDays(ci, r.maxNights), why: "max-nights" });
  if (r.max) caps.push({ last: r.max, why: "max" });
  if (r.taken?.size) {
    const until = caps.reduce((a, c) => (c.last < a ? c.last : a), addDays(ci, 731));
    for (let x = addDays(ci, 1); x < until; x = addDays(x, 1)) if (r.taken.has(x)) {
      let end = x;
      while (r.taken.has(end)) end = addDays(end, 1);
      caps.push({ last: x, why: "booked", bookedTo: end });
      break;
    }
  }
  return caps.reduce<typeof caps[number] | null>((a, c) => (!a || c.last < a.last ? c : a), null);
}

/** One plain sentence telling a guest why later check-out dates are greyed out (shown while choosing check-out on a home's calendar). */
export function checkoutLimitNote(ci: string, r: RangeRules) {
  const l = checkoutLimit(ci, r);
  if (!l || l.why === "max" || !r.taken) return "";
  const day = (d: string, wd = false) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { ...(wd ? { weekday: "short" as const } : {}), month: "short", day: "numeric", timeZone: "UTC" });
  if (l.why === "booked") {
    const lastNight = addDays(l.bookedTo!, -1);
    const span = lastNight === l.last ? `the night of ${day(l.last)}` : `from ${day(l.last)} until ${day(l.bookedTo!)}`;
    return `This home is booked ${span}, so the latest check-out for this stay is ${day(l.last, true)}. For a longer stay, pick a check-in from ${day(l.bookedTo!)} or later.`;
  }
  return `Stays at this home can be up to ${r.maxNights} nights, so the latest check-out is ${day(l.last, true)}. Contact us about longer stays.`;
}

/** Is a range already picked still allowed (e.g. dates from a search link)? */
export function validRange({ ci, co }: Range, r: RangeRules) {
  return isDate(ci) && isDate(co) && canCheckIn(ci, r) && canCheckOut(ci, co, r);
}

/**
 * What a click on `d` does. Choosing check-in always moves straight on to check-out;
 * choosing a check-out finishes (`done`). While choosing check-out, days before check-in are disabled
 * (see dayLook); "Clear dates" or the Check-in field starts over.
 */
export function pickDay(d: string, phase: Phase, cur: Range, r: RangeRules): Range & { phase: Phase; done: boolean } {
  if (phase === "co" && cur.ci && canCheckOut(cur.ci, d, r)) return { ci: cur.ci, co: d, phase: "co", done: true };
  if (!canCheckIn(d, r)) return { ...cur, phase, done: false };
  return { ci: d, co: "", phase: "co", done: false };
}

/** How day `d` looks. `hover` previews the stay while choosing check-out. */
export function dayLook(d: string, phase: Phase, cur: Range, r: RangeRules, hover = "") {
  const { ci, co } = cur;
  const taken = !!r.taken?.has(d);
  let disabled: boolean;
  let checkoutOk = false;
  if (phase === "co" && ci) {
    checkoutOk = canCheckOut(ci, d, r);
    disabled = !checkoutOk && !(d === ci && (r.minNights ?? 1) > 0);
  } else disabled = !canCheckIn(d, r);
  const end = co || (phase === "co" && ci && hover > ci && canCheckOut(ci, hover, r) ? hover : "");
  const cls = [
    d === ci ? "sel start" : d === co ? "sel end" : end && d > ci && d < end ? "in" : end && d === end ? "in end" : "",
    taken && d !== ci && d !== co ? (checkoutOk ? "taken checkout-ok" : "taken") : "",
    (!r.min || d >= r.min) ? "" : "past",
  ].filter(Boolean).join(" ");
  const note = taken ? (checkoutOk ? "booked that night, available as check-out day" : "unavailable")
    : phase === "co" && ci && d > ci && disabled && (r.minNights ?? 1) > 1 && nightsBetween(ci, d) < (r.minNights ?? 1) ? `minimum stay ${r.minNights} nights` : undefined;
  return { disabled, className: cls, note };
}

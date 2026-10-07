// All stay dates are plain "YYYY-MM-DD" strings. Math is done in UTC so it never shifts by a day.
const DAY = 86_400_000;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function addDays(s: string, n: number): string {
  return new Date(Date.parse(s + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
}
export function nightsBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);
}
/** Today's date in Pennsylvania (all listings are in US Eastern time), or the Pennsylvania date of `at`. */
export function todayLocal(tz = "America/New_York", at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  return parts; // en-CA formats as YYYY-MM-DD
}
export function fmtDate(s: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" }): string {
  return new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}
export function fmtShort(s: string): string {
  return fmtDate(s, { month: "short", day: "numeric" });
}
export function eachNight(ci: string, co: string): string[] {
  const out: string[] = [];
  for (let d = ci; d < co; d = addDays(d, 1)) out.push(d);
  return out;
}

/** A moment in time from the database: Postgres timestamps arrive as Date objects, JSON and forms give ISO text.
 *  Accepts either (or null/undefined) and returns a valid Date, or null when there is nothing usable. */
export type Instant = Date | string | number | null | undefined;
export function toInstant(v: Instant): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** The Pennsylvania calendar date ("YYYY-MM-DD") of a moment, or null. Never call string methods on a timestamp. */
export function localDateOf(v: Instant, tz = "America/New_York"): string | null {
  const d = toInstant(v);
  return d ? todayLocal(tz, d) : null;
}
const WHEN_STYLES = {
  full: { dateStyle: "medium", timeStyle: "short" },
  short: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;
/** "Oct 6, 2026, 12:52 AM" (or "Oct 6, 12:52 AM" with style "short") in Pennsylvania time; "" when unknown. */
export function fmtWhen(v: Instant, style: keyof typeof WHEN_STYLES = "full"): string {
  const d = toInstant(v);
  return d ? d.toLocaleString("en-US", { timeZone: "America/New_York", ...WHEN_STYLES[style] }) : "";
}

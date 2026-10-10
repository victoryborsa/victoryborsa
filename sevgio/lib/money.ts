export function money(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2, maximumFractionDigits: 2 });
}
export function toCents(input: string): number | null {
  const n = Number(String(input).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
/** A nightly rate short enough for a calendar box: "$110", "$1.3k". Whole dollars. */
export function moneyShort(cents: number): string {
  const d = Math.round(cents / 100);
  return d >= 1000 ? `$${(Math.round(d / 100) / 10).toString()}k` : `$${d}`;
}

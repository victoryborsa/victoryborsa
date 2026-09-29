import { nightsBetween } from "./dates.ts";

export type Quote = { nights: number; nightly: number; base: number; cleaning: number; tax: number; total: number };

/** Price for a stay, in cents. Shared by the browser (live preview) and the server (the amount that is saved). */
export function quote(p: { nightly_price_cents: number; cleaning_fee_cents: number }, ci: string, co: string, taxPercent: number): Quote {
  const nights = nightsBetween(ci, co);
  const base = nights * p.nightly_price_cents;
  const cleaning = p.cleaning_fee_cents;
  const tax = Math.round(((base + cleaning) * taxPercent) / 100);
  return { nights, nightly: p.nightly_price_cents, base, cleaning, tax, total: base + cleaning + tax };
}

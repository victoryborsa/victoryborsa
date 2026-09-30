import { nightsBetween } from "./dates.ts";

export type PricingInput = {
  nightly_price_cents: number; cleaning_fee_cents: number; max_guests: number; base_occupancy?: number | null;
  extra_guest_fee_cents?: number; fewer_guest_discount_percent?: number; weekly_discount_percent?: number; monthly_discount_percent?: number;
};
/** Who is staying. Children at or under the listing's free age are `free_children` and don't change the price. */
export type Party = { adults: number; children: number; free_children: number };

export type Quote = {
  nights: number;
  baseNightly: number;     // listing's normal nightly price
  nightly: number;         // nightly price for this group
  extraGuests: number;     // guests above base occupancy (paying an extra-guest fee)
  fewerGuests: number;     // guests below base occupancy (getting a discount)
  base: number;            // nightly × nights
  discount: number;        // weekly / monthly discount
  discountLabel: string;
  cleaning: number;
  tax: number;
  total: number;
};

/** Price for a stay, in cents. Shared by the browser (live preview) and the server (the amount that is saved). */
export function quote(p: PricingInput, ci: string, co: string, taxPercent: number, party?: Party): Quote {
  const nights = nightsBetween(ci, co);
  const baseOcc = Math.min(p.base_occupancy || p.max_guests, p.max_guests);
  const billable = party ? Math.max(1, party.adults + party.children) : baseOcc;
  const extraGuests = Math.max(0, billable - baseOcc);
  const fewerGuests = Math.max(0, baseOcc - billable);
  const fewerPct = Math.min(90, fewerGuests * Number(p.fewer_guest_discount_percent || 0));
  const nightly = Math.round(p.nightly_price_cents * (1 - fewerPct / 100)) + extraGuests * (p.extra_guest_fee_cents || 0);
  const base = nightly * nights;
  const monthly = Number(p.monthly_discount_percent || 0), weekly = Number(p.weekly_discount_percent || 0);
  const pct = nights >= 28 && monthly > 0 ? monthly : nights >= 7 ? weekly : 0;
  const discountLabel = pct ? `${nights >= 28 && monthly > 0 ? "Monthly" : "Weekly"} discount (${pct}%)` : "";
  const discount = Math.round((base * pct) / 100);
  const cleaning = p.cleaning_fee_cents;
  const tax = Math.round(((base - discount + cleaning) * taxPercent) / 100);
  return { nights, baseNightly: p.nightly_price_cents, nightly, extraGuests, fewerGuests, base, discount, discountLabel, cleaning, tax, total: base - discount + cleaning + tax };
}

/** Management fee and owner payout for a booking. Fee applies to lodging after discounts (not cleaning or tax). */
export function payout(b: { lodging_cents: number; discount_cents: number; cleaning_fee_cents: number; management_fee_percent: number }) {
  const rent = b.lodging_cents - b.discount_cents;
  const fee = Math.round((rent * Number(b.management_fee_percent)) / 100);
  return { rent, fee, owner: rent + b.cleaning_fee_cents - fee };
}

import { eachNight, nightsBetween, todayLocal } from "./dates.ts";
import { nightPrice, pricedByNight, type SmartListing } from "./smart-pricing.ts";
import { parseServices } from "./constants.ts";

export type PricingInput = SmartListing & {
  monthly_price_cents?: number | null;
  nightly_price_cents: number; cleaning_fee_cents: number; max_guests: number; base_occupancy?: number | null;
  extra_guest_fee_cents?: number; fewer_guest_discount_percent?: number; weekly_discount_percent?: number; monthly_discount_percent?: number;
  pets_allowed?: boolean; amenities?: string[]; pet_fee_cents?: number; pet_fee_per?: string; services?: unknown;
};
/** Who is staying. Children at or under the listing's free age are `free_children` and don't change the price. */
export type Party = { adults: number; children: number; free_children: number; pets?: number; services?: string[] };

export type Quote = {
  nights: number;
  baseNightly: number;     // listing's normal nightly price
  nightly: number;         // nightly price for this group (the average when smart pricing changes it night by night)
  smart: boolean;          // smart pricing set the nightly prices
  byNight: { date: string; cents: number }[]; // each night's calendar price (before guest-count changes) when nights can differ, else empty
  months: number;          // monthly rentals: whole months in the stay (0 otherwise)
  extraDays: number;       // monthly rentals: days beyond the whole months, charged at the monthly rent ÷ 30
  extraGuests: number;     // guests above base occupancy (paying an extra-guest fee)
  fewerGuests: number;     // guests below base occupancy (getting a discount)
  base: number;            // nightly × nights
  discount: number;        // weekly / monthly discount
  discountLabel: string;
  cleaning: number;
  pets: number;
  petFee: number;          // pet fee for this stay (0 when free or no pets)
  extras: { key: string; name: string; per: string; price_cents: number; qty: number; total: number }[]; // paid services the guest chose
  extrasTotal: number;
  tax: number;
  total: number;
};

/** Price for a stay, in cents. Shared by the browser (live preview) and the server (the amount that is saved). */
export function quote(p: PricingInput, ci: string, co: string, taxPercent: number, party?: Party, today = todayLocal()): Quote {
  const nights = nightsBetween(ci, co);
  const baseOcc = Math.min(p.base_occupancy || p.max_guests, p.max_guests);
  const billable = party ? Math.max(1, party.adults + party.children) : baseOcc;
  const extraGuests = Math.max(0, billable - baseOcc);
  const fewerGuests = Math.max(0, baseOcc - billable);
  const fewerPct = Math.min(90, fewerGuests * Number(p.fewer_guest_discount_percent || 0));
  if (p.monthly_price_cents) return monthlyQuote(p, p.monthly_price_cents, nights, taxPercent, party);
  const forGroup = (rate: number) => Math.round(rate * (1 - fewerPct / 100)) + extraGuests * (p.extra_guest_fee_cents || 0);
  const smart = !!p.smart_pricing && nights > 0;
  // Smart Pricing or nights priced by hand: every night is priced on its own, exactly as the calendar shows it.
  const byNight = pricedByNight(p) && nights > 0 ? eachNight(ci, co).map(date => ({ date, cents: nightPrice(p, date, today) })) : [];
  const base = byNight.length ? byNight.reduce((n, x) => n + forGroup(x.cents), 0) : forGroup(p.nightly_price_cents) * nights;
  const nightly = byNight.length ? Math.round(base / nights) : forGroup(p.nightly_price_cents);
  const monthly = Number(p.monthly_discount_percent || 0), weekly = Number(p.weekly_discount_percent || 0);
  const pct = nights >= 28 && monthly > 0 ? monthly : nights >= 7 ? weekly : 0;
  const discountLabel = pct ? `${nights >= 28 && monthly > 0 ? "Monthly" : "Weekly"} discount (${pct}%)` : "";
  const discount = Math.round((base * pct) / 100);
  const cleaning = p.cleaning_fee_cents;
  const pets = (p.pets_allowed ?? p.amenities?.includes("pets")) ? Math.max(0, party?.pets || 0) : 0;
  const petFee = petFeeFor(p, pets, nights);
  const tax = Math.round(((base - discount + cleaning + petFee) * taxPercent) / 100);
  // Extra services aren't lodging, so no lodging tax is added to them.
  const people = party ? party.adults + party.children + party.free_children : billable;
  const chosen = new Set(party?.services ?? []);
  const extras = parseServices(p.services).filter(x => chosen.has(x.key)).map(x => {
    const qty = x.per === "person" ? people : x.per === "night" ? nights : 1;
    return { key: x.key, name: x.name, per: x.per, price_cents: x.price_cents, qty, total: x.price_cents * qty };
  });
  const extrasTotal = extras.reduce((n, x) => n + x.total, 0);
  return { nights, baseNightly: p.nightly_price_cents, nightly, smart, byNight, months: 0, extraDays: 0, extraGuests, fewerGuests, base, discount, discountLabel, cleaning, pets, petFee, extras, extrasTotal, tax,
    total: base - discount + cleaning + petFee + extrasTotal + tax };
}

export const PET_FEE_PER: Record<string, string> = { stay: "per stay", night: "per night", pet_stay: "per pet, per stay", pet_night: "per pet, per night" };

/** The pet fee for a stay: flat per stay, per night, per pet, or per pet per night. */
export function petFeeFor(p: { pet_fee_cents?: number; pet_fee_per?: string }, pets: number, nights: number): number {
  const fee = p.pet_fee_cents || 0;
  if (!pets || !fee) return 0;
  const per = p.pet_fee_per || "stay";
  return fee * (per === "night" ? nights : per === "pet_stay" ? pets : per === "pet_night" ? pets * nights : 1);
}

/** Management fee and owner payout for a booking. Fee applies to lodging after discounts (not cleaning or tax). */
export function payout(b: { lodging_cents: number; discount_cents: number; cleaning_fee_cents: number; management_fee_percent: number }) {
  const rent = b.lodging_cents - b.discount_cents;
  const fee = Math.round((rent * Number(b.management_fee_percent)) / 100);
  return { rent, fee, owner: rent + b.cleaning_fee_cents - fee };
}

/** Monthly rentals are all-inclusive: the rent per month (30 nights), plus monthly rent ÷ 30 for each extra day. No per-guest pricing. */
function monthlyQuote(p: PricingInput, monthly: number, nights: number, taxPercent: number, party?: Party): Quote {
  const months = Math.max(0, Math.floor(nights / 30)), extraDays = Math.max(0, nights - months * 30);
  const base = months * monthly + Math.round((extraDays * monthly) / 30);
  const cleaning = p.cleaning_fee_cents;
  const pets = (p.pets_allowed ?? p.amenities?.includes("pets")) ? Math.max(0, party?.pets || 0) : 0;
  const petFee = petFeeFor(p, pets, nights);
  // Rent is all-inclusive, and Pennsylvania's hotel occupancy tax doesn't apply to stays of 30 days or more.
  const tax = nights >= 30 ? 0 : Math.round(((base + cleaning + petFee) * taxPercent) / 100);
  const chosen = new Set(party?.services ?? []);
  const people = party ? party.adults + party.children + party.free_children : p.max_guests;
  const extras = parseServices(p.services).filter(x => chosen.has(x.key)).map(x => {
    const qty = x.per === "person" ? people : x.per === "night" ? nights : 1;
    return { key: x.key, name: x.name, per: x.per, price_cents: x.price_cents, qty, total: x.price_cents * qty };
  });
  const extrasTotal = extras.reduce((n, x) => n + x.total, 0);
  return { nights, baseNightly: p.nightly_price_cents, nightly: nights > 0 ? Math.round(base / nights) : 0, smart: false, byNight: [], months, extraDays, extraGuests: 0, fewerGuests: 0,
    base, discount: 0, discountLabel: "", cleaning, pets, petFee, extras, extrasTotal, tax, total: base + cleaning + petFee + extrasTotal + tax };
}

/** The headline price for a listing: the monthly rent for monthly rentals, else the nightly price. */
export function priceTag(p: { nightly_price_cents: number; monthly_price_cents?: number | null }): { cents: number; unit: "month" | "night" } {
  return p.monthly_price_cents ? { cents: p.monthly_price_cents, unit: "month" } : { cents: p.nightly_price_cents, unit: "night" };
}

/** "$995 × 1 month + 5 days", or "$120 × 3 nights". */
export function baseLabel(q: Quote, money: (c: number) => string, p: { monthly_price_cents?: number | null }): string {
  if (p.monthly_price_cents) {
    const parts = [q.months ? `${money(p.monthly_price_cents)} × ${q.months} month${q.months === 1 ? "" : "s"}` : "", q.extraDays ? `${q.extraDays} extra day${q.extraDays === 1 ? "" : "s"}` : ""].filter(Boolean);
    return parts.join(" + ");
  }
  const varies = new Set(q.byNight.map(x => x.cents)).size > 1;
  return `${money(q.nightly)}${varies ? " avg" : ""} × ${q.nights} night${q.nights === 1 ? "" : "s"}`;
}

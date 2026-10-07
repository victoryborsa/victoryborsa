import type { Demand } from "./smart-pricing.ts";
import { withNightPricing } from "./demand.ts";
import crypto from "node:crypto";
import type pg from "pg";
import { one, q, tx, type Db } from "./db.ts";
import { addDays, isIsoDate, nightsBetween, todayLocal } from "./dates.ts";
import { quote, type Party } from "./pricing.ts";
import { dueNow, type PayMethod } from "./payment-rules.ts";
import { FIXED_SERVICE_NOTES, REQUEST_EXPIRY_HOURS } from "./constants.ts";

export type Property = {
  id: string; slug: string; host_id: string; title: string; city: string; area: string; address: string; description: string; property_type: string;
  max_guests: number; bedrooms: number; beds: number; bathrooms: number; nightly_price_cents: number; cleaning_fee_cents: number;
  min_nights: number; max_nights: number; booking_mode: "instant" | "request"; cancellation_policy: string; check_in_time: string; check_out_time: string;
  amenities: string[]; house_rules: string[]; arrival_instructions: string; status: "draft" | "published" | "hidden"; rating: number | null; review_count: number; ical_token: string;
  parent_id: string | null; bathroom_type: "private" | "shared";
  beds_detail: unknown; half_bathrooms: number; kitchen_access: string; laundry_access: string; stairs_info: string; has_exterior_cameras: boolean; camera_locations: string; smoking?: string; created_at?: string | Date;
  base_occupancy: number | null; extra_guest_fee_cents: number; fewer_guest_discount_percent: number; weekly_discount_percent: number; monthly_discount_percent: number;
  children_free_age: number; management_fee_percent: number; shared_spaces: string; owner_zelle: string; owner_venmo: string; pet_fee_cents: number; pet_fee_per: string; rooms_detail: unknown; services: unknown; security_deposit_cents: number; lat: number | null; lng: number | null; monthly_price_cents: number | null; smart_pricing: boolean;
  corp_listed?: boolean; corp_monthly_cents?: number | null; corp_deposit_cents?: number; corp_cleaning_cents?: number; corp_pet_fee_cents?: number; corp_available_from?: string | null; furnished_finder_url?: string; corp_position?: number | null;
  corp_furnished?: boolean; corp_lease_only?: boolean; corp_app_fee_cents?: number; corp_apply_url?: string; corp_price_note?: string; utilities?: string; min_price_cents: number | null; max_price_cents: number | null; demand?: Demand; prices?: Record<string, number>;
};

export type Booking = {
  id: string; code: string; property_id: string; guest_id: string; check_in: string; check_out: string; guests: number; status: string; nights: number;
  nightly_price_cents: number; cleaning_fee_cents: number; tax_cents: number; total_cents: number; guest_name: string; guest_phone: string;
  arrival_time: string; message: string; host_note: string; cancelled_by: string | null; created_at: string;
  adults: number; children: number; free_children: number; lodging_cents: number; discount_cents: number; management_fee_percent: number; pets: number; pet_fee_cents: number; services: unknown; services_cents: number; security_deposit_cents: number;
  payment_method: PayMethod | null; card_fee_cents: number; due_now_cents: number; paid_cents: number;
  payment_status: "none" | "pending" | "processing" | "paid" | "deposit_paid" | "failed" | "refunded"; payment_deadline: string | null;
};

const ACTIVE = "('pending','awaiting_payment','confirmed')";

/**
 * Listings whose bookings share nights with this one: itself, the whole home it belongs to, and the rooms inside it.
 * Rooms of the same home don't block each other. Use as `property_id IN ${RELATED("$1")}`.
 */
export const RELATED = (param: string) =>
  `(SELECT r.id FROM properties r, properties me WHERE me.id = ${param} AND (r.id = me.id OR r.parent_id = me.id OR r.id = me.parent_id))`;

/** Serialises every booking and block change for a whole home and its rooms, so two requests can never both pass the availability check. */
export async function lockProperty(c: Db, propertyId: string) {
  const root = await one<{ root: string }>("SELECT coalesce(parent_id, id)::text AS root FROM properties WHERE id = $1", [propertyId], c);
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [root?.root ?? propertyId]);
}

/** Requests the host never answered, and bookings not paid by their deadline, expire and release the dates. */
export async function expireStaleRequests() {
  return q<{ id: string }>(
    `UPDATE bookings SET status = 'expired', updated_at = now()
     WHERE (status = 'pending' AND created_at < now() - make_interval(hours => $1))
        OR (status = 'awaiting_payment' AND payment_deadline < now() AND payment_status IN ('pending', 'failed'))
     RETURNING id`,
    [REQUEST_EXPIRY_HOURS],
  );
}
/** Nights (check-in dates) that can't be booked between `from` and `to`. */
export async function unavailableNights(propertyId: string, from: string, to: string, db?: Db, exceptBooking: string | null = null): Promise<string[]> {
  const rows = await q<{ d: string }>(
    `SELECT DISTINCT d::date::text AS d FROM (
       SELECT generate_series(greatest(check_in, $2::date), least(check_out, $3::date) - 1, interval '1 day') AS d
         FROM bookings WHERE property_id IN ${RELATED("$1")} AND status IN ${ACTIVE} AND check_out > $2 AND check_in < $3 AND id IS DISTINCT FROM $4::uuid
       UNION ALL
       SELECT generate_series(greatest(start_date, $2::date), least(end_date, $3::date) - 1, interval '1 day')
         FROM blocks WHERE property_id IN ${RELATED("$1")} AND end_date > $2 AND start_date < $3
     ) x ORDER BY 1`,
    [propertyId, from, to, exceptBooking],
    db,
  );
  return rows.map(r => r.d);
}

export async function isRangeFree(propertyId: string, ci: string, co: string, db?: Db): Promise<boolean> {
  const r = await one<{ n: number }>(
    `SELECT (SELECT count(*) FROM bookings WHERE property_id IN ${RELATED("$1")} AND status IN ${ACTIVE} AND check_in < $3 AND check_out > $2)
          + (SELECT count(*) FROM blocks WHERE property_id IN ${RELATED("$1")} AND start_date < $3 AND end_date > $2) AS n`,
    [propertyId, ci, co],
    db,
  );
  return !!r && r.n === 0;
}

/** Checks a requested stay against the listing's rules. Returns an error message for the guest, or null. */
export function stayProblem(p: Pick<Property, "min_nights" | "max_nights" | "max_guests"> & { amenities?: string[] }, ci: string, co: string, party: Party | number, today = todayLocal()): string | null {
  const pt: Party = typeof party === "number" ? { adults: party, children: 0, free_children: 0 } : party;
  if (!isIsoDate(ci) || !isIsoDate(co)) return "Choose your check-in and check-out dates.";
  if (ci < today) return "Check-in can't be in the past.";
  if (co <= ci) return "Check-out must be after check-in.";
  if (ci > addDays(today, 540)) return "Bookings open up to 18 months ahead.";
  const n = nightsBetween(ci, co);
  if (n < p.min_nights) return `This home has a ${p.min_nights}-night minimum stay.`;
  if (n > p.max_nights) return `Stays at this home can be up to ${p.max_nights} nights. Contact us about longer stays.`;
  const counts = [pt.adults, pt.children, pt.free_children];
  if (!counts.every(c => Number.isInteger(c) && c >= 0) || pt.adults < 1) return "At least one adult must be on the booking.";
  const total = pt.adults + pt.children + pt.free_children;
  if (total > p.max_guests) return `This home fits up to ${p.max_guests} guests, including children.`;
  if ((pt.pets || 0) > 0 && p.amenities && !p.amenities.includes("pets")) return "Sorry, pets aren't allowed at this home.";
  return null;
}

function newCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  return "SV-" + Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}

/** When payments are on: how the guest will pay, and how long the dates are held waiting for it. */
/** `later`: the guest pays at the property (or online later), so the booking doesn't wait for a payment. */
export type PaymentChoice = { method: PayMethod; card_fee_percent: number; card_fee_fixed_cents: number; deposit_percent: number; holdMinutes: number; later?: boolean };
export type NewBooking = { propertyId: string; guestId: string; ci: string; co: string; party: Party; name: string; phone: string; arrival: string; message: string; taxPercent: number; pay: PaymentChoice | null; serviceDetails?: Record<string, string> };
export type CreateResult = { ok: true; booking: Booking; property: Property } | { ok: false; error: string; reason: "invalid" | "unavailable" | "not_found" };

export async function createBooking(b: NewBooking): Promise<CreateResult> {
  try {
    return await tx(async c => {
      await lockProperty(c, b.propertyId);
      const p = await one<Property>("SELECT * FROM properties WHERE id = $1 AND status = 'published' AND NOT corp_lease_only", [b.propertyId], c);
      if (!p) return { ok: false, error: "This home isn't taking bookings right now.", reason: "not_found" } as const;
      const problem = stayProblem(p, b.ci, b.co, b.party);
      if (problem) return { ok: false, error: problem, reason: "invalid" } as const;
      if (!(await isRangeFree(p.id, b.ci, b.co, c))) return { ok: false, error: "Some of these nights were just booked. Please choose different dates.", reason: "unavailable" } as const;
      await withNightPricing(p, b.ci, b.co, c);
      const pr = quote(p, b.ci, b.co, b.taxPercent, b.party);
      const guests = b.party.adults + b.party.children + b.party.free_children;
      // Instant bookings wait for payment when payments are on; requests wait for the host first either way.
      const waits = !!b.pay && !b.pay.later;
      const status = p.booking_mode === "request" ? "pending" : waits ? "awaiting_payment" : "confirmed";
      const due = b.pay ? dueNow(b.pay.method, pr.total, b.pay) : { fee: 0, now: 0 };
      const deadline = status === "awaiting_payment" ? new Date(Date.now() + b.pay!.holdMinutes * 60_000).toISOString() : null;
      for (let attempt = 0; ; attempt++) {
        try {
          const booking = await one<Booking>(
            `INSERT INTO bookings (code, property_id, guest_id, check_in, check_out, guests, status, nights, nightly_price_cents, cleaning_fee_cents, tax_cents, total_cents, guest_name, guest_phone, arrival_time, message,
               adults, children, free_children, lodging_cents, discount_cents, management_fee_percent,
               payment_method, card_fee_cents, due_now_cents, payment_status, payment_deadline, pets, pet_fee_cents, services, services_cents, security_deposit_cents)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32) RETURNING *`,
            [newCode(), p.id, b.guestId, b.ci, b.co, guests, status, pr.nights, pr.nightly, pr.cleaning, pr.tax, pr.total, b.name, b.phone, b.arrival, b.message,
              b.party.adults, b.party.children, b.party.free_children, pr.base, pr.discount, p.management_fee_percent,
              b.pay?.method ?? null, due.fee, due.now, waits ? "pending" : "none", deadline, pr.pets, pr.petFee, JSON.stringify(pr.extras.map(x => { const details = [b.serviceDetails?.[x.key], FIXED_SERVICE_NOTES[x.key]].filter(Boolean).join(" · "); return details ? { ...x, details } : x; })), pr.extrasTotal, p.security_deposit_cents || 0],
            c,
          );
          return { ok: true, booking: booking!, property: p } as const;
        } catch (e) {
          if ((e as pg.DatabaseError).code === "23505" && attempt < 3) continue; // booking code collision, try another
          throw e;
        }
      }
    });
  } catch (e) {
    // Last line of defence: the exclusion constraint in the database.
    if ((e as pg.DatabaseError).code === "23P01") return { ok: false, error: "Some of these nights were just booked. Please choose different dates.", reason: "unavailable" };
    throw e;
  }
}

export async function setBookingStatus(bookingId: string, from: string[], to: "confirmed" | "declined" | "cancelled", extra: { cancelledBy?: string; hostNote?: string } = {}) {
  return one<Booking>(
    `UPDATE bookings SET status = $3, cancelled_by = coalesce($4, cancelled_by), host_note = coalesce($5, host_note), updated_at = now()
     WHERE id = $1 AND status = ANY($2) RETURNING *`,
    [bookingId, from, to, extra.cancelledBy ?? null, extra.hostNote ?? null],
  );
}

export type BlockResult = { ok: true } | { ok: false; error: string };

export async function addBlock(propertyId: string, start: string, end: string, note: string, source = "host"): Promise<BlockResult> {
  if (!isIsoDate(start) || !isIsoDate(end) || end <= start) return { ok: false, error: "Choose a start date and an end date after it." };
  return tx(async c => {
    await lockProperty(c, propertyId);
    const clash = await one<{ code: string }>(
      `SELECT code FROM bookings WHERE property_id IN ${RELATED("$1")} AND status IN ${ACTIVE} AND check_in < $3 AND check_out > $2 LIMIT 1`,
      [propertyId, start, end],
      c,
    );
    if (clash) return { ok: false, error: `Those dates overlap booking ${clash.code}. Cancel or change that booking first.` };
    await q("INSERT INTO blocks (property_id, start_date, end_date, note, source) VALUES ($1, $2, $3, $4, $5)", [propertyId, start, end, note, source], c);
    return { ok: true };
  });
}

/** Replaces all blocks from one imported calendar feed in a single transaction. Nights that clash with a direct booking are skipped and reported. */
export async function replaceFeedBlocks(propertyId: string, source: string, ranges: { start: string; end: string; note: string }[]) {
  return tx(async c => {
    await lockProperty(c, propertyId);
    await q("DELETE FROM blocks WHERE property_id = $1 AND source = $2", [propertyId, source], c);
    const clashes: string[] = [];
    for (const r of ranges) {
      const clash = await one<{ code: string }>(
        `SELECT code FROM bookings WHERE property_id IN ${RELATED("$1")} AND status IN ${ACTIVE} AND check_in < $3 AND check_out > $2 LIMIT 1`,
        [propertyId, r.start, r.end],
        c,
      );
      if (clash) { clashes.push(`${r.start} to ${r.end} overlaps ${clash.code}`); continue; }
      await q("INSERT INTO blocks (property_id, start_date, end_date, note, source) VALUES ($1, $2, $3, $4, $5)", [propertyId, r.start, r.end, r.note, source], c);
    }
    return clashes;
  });
}

export type ManualBooking = { propertyId: string; guestId: string; ci: string; co: string; name: string; phone: string; taxPercent: number };

/**
 * A reservation the host enters for a guest who called or wrote directly. It is confirmed straight away with nothing paid:
 * the guest pays at the property (marked as cash with no deposit due, so it never expires for non-payment).
 * Uses the same lock, availability check and database constraint as website bookings, so it can't double-book.
 * Listing rules (minimum nights, published or not) don't apply; the host decides.
 */
export async function createManualBooking(b: ManualBooking): Promise<CreateResult> {
  if (!isIsoDate(b.ci) || !isIsoDate(b.co) || b.co <= b.ci) return { ok: false, error: "Check-out must be after check-in.", reason: "invalid" };
  if (nightsBetween(b.ci, b.co) > 365) return { ok: false, error: "A reservation can be at most 365 nights.", reason: "invalid" };
  try {
    return await tx(async c => {
      await lockProperty(c, b.propertyId);
      const p = await one<Property>("SELECT * FROM properties WHERE id = $1", [b.propertyId], c);
      if (!p) return { ok: false, error: "Choose a property.", reason: "not_found" } as const;
      if (!(await isRangeFree(p.id, b.ci, b.co, c))) return { ok: false, error: "These dates are already booked or blocked for this property. Pick other dates, or check the calendar.", reason: "unavailable" } as const;
      await withNightPricing(p, b.ci, b.co, c);
      const pr = quote(p, b.ci, b.co, b.taxPercent); // the listing's normal price for its standard number of guests
      for (let attempt = 0; ; attempt++) {
        try {
          const booking = await one<Booking>(
            `INSERT INTO bookings (code, property_id, guest_id, check_in, check_out, guests, status, nights, nightly_price_cents, cleaning_fee_cents, tax_cents, total_cents, guest_name, guest_phone, arrival_time, message,
               adults, children, free_children, lodging_cents, discount_cents, management_fee_percent, payment_method, card_fee_cents, due_now_cents, payment_status, security_deposit_cents)
             VALUES ($1,$2,$3,$4,$5,1,'confirmed',$6,$7,$8,$9,$10,$11,$12,'','',1,0,0,$13,$14,$15,'cash',0,0,'none',$16) RETURNING *`,
            [newCode(), p.id, b.guestId, b.ci, b.co, pr.nights, pr.nightly, pr.cleaning, pr.tax, pr.total, b.name, b.phone, pr.base, pr.discount, p.management_fee_percent, p.security_deposit_cents || 0],
            c,
          );
          return { ok: true, booking: booking!, property: p } as const;
        } catch (e) {
          if ((e as pg.DatabaseError).code === "23505" && attempt < 3) continue;
          throw e;
        }
      }
    });
  } catch (e) {
    if ((e as pg.DatabaseError).code === "23P01") return { ok: false, error: "These dates are already booked for this property.", reason: "unavailable" };
    throw e;
  }
}

/**
 * The price for new dates, keeping the nightly rate the guest agreed to: lodging follows the number of nights, a length-of-stay
 * discount and tax keep the same proportion, and cleaning, pet and extra-service fees stay as they were.
 */
export function repriceForNights(b: Pick<Booking, "nights" | "nightly_price_cents" | "lodging_cents" | "discount_cents" | "tax_cents" | "total_cents">, nights: number) {
  const lodging = b.nightly_price_cents * nights;
  const discount = b.nights > 0 ? Math.round(b.discount_cents * nights / b.nights) : 0;
  const fees = b.total_cents - b.tax_cents - (b.lodging_cents - b.discount_cents);
  const preTaxOld = b.total_cents - b.tax_cents;
  const taxRate = preTaxOld > 0 ? b.tax_cents / preTaxOld : 0;
  const preTax = lodging - discount + fees;
  const tax = Math.round(preTax * taxRate);
  return { nights, lodging_cents: lodging, discount_cents: discount, tax_cents: tax, total_cents: preTax + tax };
}

export type ReservationChange = { checkIn: string; checkOut: string; guestName: string; guestPhone: string; guests: number; totalCents?: number | null };
export type ChangeResult = { ok: true; before: Booking; after: Booking } | { ok: false; error: string };

/**
 * Admin edit of a Sevgio reservation: dates, guest name, phone, number of guests and (optionally) the total.
 * New dates are checked against every other booking and every blocked night (other sites' reservations and calendar blocks
 * included), under the same lock and database constraint as a new booking, so an edit can never create a double booking.
 */
export async function changeReservation(bookingId: string, ch: ReservationChange): Promise<ChangeResult> {
  if (!isIsoDate(ch.checkIn) || !isIsoDate(ch.checkOut) || ch.checkOut <= ch.checkIn) return { ok: false, error: "Check-out must be after check-in." };
  if (nightsBetween(ch.checkIn, ch.checkOut) > 365) return { ok: false, error: "A reservation can be at most 365 nights." };
  if (!ch.guestName.trim()) return { ok: false, error: "Enter the guest's name." };
  if (!Number.isInteger(ch.guests) || ch.guests < 1) return { ok: false, error: "Enter at least 1 guest." };
  try {
    return await tx(async c => {
      const cur = await one<Booking>("SELECT * FROM bookings WHERE id = $1", [bookingId], c);
      if (!cur) return { ok: false, error: "Reservation not found." } as const;
      await lockProperty(c, cur.property_id);
      const b = (await one<Booking>("SELECT * FROM bookings WHERE id = $1 FOR UPDATE", [bookingId], c))!;
      if (!["pending", "awaiting_payment", "confirmed"].includes(b.status)) return { ok: false, error: "Only active reservations can be changed." } as const;
      const p = await one<{ max_guests: number }>("SELECT max_guests FROM properties WHERE id = $1", [b.property_id], c);
      if (p && ch.guests > p.max_guests) return { ok: false, error: `This property fits up to ${p.max_guests} guests.` } as const;
      const datesChanged = ch.checkIn !== b.check_in || ch.checkOut !== b.check_out;
      if (datesChanged) {
        const clash = await one<{ n: number }>(
          `SELECT (SELECT count(*) FROM bookings WHERE property_id IN ${RELATED("$1")} AND status IN ${ACTIVE} AND id <> $4 AND check_in < $3 AND check_out > $2)
                + (SELECT count(*) FROM blocks WHERE property_id IN ${RELATED("$1")} AND start_date < $3 AND end_date > $2) AS n`,
          [b.property_id, ch.checkIn, ch.checkOut, b.id], c);
        if (clash && clash.n > 0) return { ok: false, error: "Those dates overlap another reservation or blocked dates for this property (on Sevgio, Airbnb, Booking.com, Vrbo or a calendar link)." } as const;
      }
      const price = datesChanged ? repriceForNights(b, nightsBetween(ch.checkIn, ch.checkOut)) : { nights: b.nights, lodging_cents: b.lodging_cents, discount_cents: b.discount_cents, tax_cents: b.tax_cents, total_cents: b.total_cents };
      if (ch.totalCents != null && ch.totalCents >= 0) price.total_cents = ch.totalCents;
      const extraAdults = ch.guests - b.children - b.free_children;
      const after = await one<Booking>(
        `UPDATE bookings SET check_in = $2, check_out = $3, nights = $4, lodging_cents = $5, discount_cents = $6, tax_cents = $7, total_cents = $8,
           guest_name = $9, guest_phone = $10, guests = $11, adults = $12,
           payment_status = CASE WHEN payment_status IN ('paid', 'deposit_paid') THEN (CASE WHEN paid_cents >= $8 THEN 'paid' ELSE 'deposit_paid' END) ELSE payment_status END,
           checkin_email_at = CASE WHEN $2 <> check_in THEN NULL ELSE checkin_email_at END, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [b.id, ch.checkIn, ch.checkOut, price.nights, price.lodging_cents, price.discount_cents, price.tax_cents, price.total_cents,
          ch.guestName.trim(), ch.guestPhone.trim(), ch.guests, Math.max(1, extraAdults)], c);
      return { ok: true, before: b, after: after! } as const;
    });
  } catch (e) {
    if ((e as pg.DatabaseError).code === "23P01") return { ok: false, error: "Those dates overlap another reservation for this property." };
    throw e;
  }
}

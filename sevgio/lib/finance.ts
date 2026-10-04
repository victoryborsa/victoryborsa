import { q } from "./db.ts";
import type { User } from "./auth.ts";
import { addDays, isIsoDate, nightsBetween, todayLocal } from "./dates.ts";
import { channelLabel, isChannel, occupancy, unitsOf, type ChannelKey, type NightStay } from "./channels.ts";

/**
 * One reporting model for Finance, statements and the CSV download, so their totals always agree.
 * - Reservations (and their money) count in the period their check-in falls in, like the sites' own statements.
 * - Booked nights and occupancy count the nights actually inside the period.
 * - Money a site never sent us is null, shown as "Needs entry", never as $0.
 */

export type Listing = { id: string; title: string; parent_id: string | null; management_fee_percent: number };
export type Filters = { from: string; to: string; property: string | null; room: string | null; channel: ChannelKey | null };

export type ReportRow = {
  id: string; source: "sevgio" | "platform"; channel: string; channelLabel: string; ref: string; href: string;
  property_id: string; place: string; guest_name: string; check_in: string; check_out: string; nights: number; guests: number | null; status: "confirmed" | "cancelled";
  rent: number | null; cleaning: number | null; other: number | null; tax: number | null; commission: number | null; refund: number | null;
  expected: number | null; received: number | null; payout_date: string | null;
  mgmtPercent: number; fee: number | null; owner: number | null; needsEntry: boolean;
};

export const MONEY_KEYS = ["rent", "cleaning", "other", "tax", "commission", "refund", "expected", "received", "fee", "owner"] as const;
export type MoneyKey = (typeof MONEY_KEYS)[number];
/** A total of known amounts, plus how many reservations had no amount yet. */
export type Total = { cents: number; missing: number; known: number };
export type Totals = Record<MoneyKey, Total> & { bookings: number; cancelled: number };

export const validMonth = (s: unknown) => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, next, days: nightsBetween(start, next) };
}

/** Reads the report filters from a URL. `to` is the last day included. Older links with ?month=YYYY-MM still work. */
export function readFilters(sp: Record<string, string | undefined>, listings: Listing[]): Filters {
  let from: string, to: string;
  if (isIsoDate(sp.from) && isIsoDate(sp.to) && sp.from! <= sp.to!) { from = sp.from!; to = sp.to!; }
  else { const m = monthRange(validMonth(sp.month) ? sp.month! : todayLocal().slice(0, 7)); from = m.start; to = addDays(m.next, -1); }
  // Keep a report to at most about three years, so a typo can't ask for centuries.
  if (nightsBetween(from, to) > 1100) to = addDays(from, 1100);
  const property = listings.find(l => l.id === sp.property && !l.parent_id)?.id ?? null;
  const room = property ? listings.find(l => l.id === sp.room && l.parent_id === property)?.id ?? null : null;
  return { from, to, property, room, channel: isChannel(sp.channel) ? sp.channel : null };
}

export async function financeListings(u: User): Promise<Listing[]> {
  return u.role === "admin"
    ? q<Listing>("SELECT id, title, parent_id, management_fee_percent FROM properties ORDER BY title")
    : q<Listing>(`SELECT id, title, parent_id, management_fee_percent FROM properties
                  WHERE host_id = $1 OR parent_id IN (SELECT id FROM properties WHERE host_id = $1) ORDER BY title`, [u.id]);
}

/** The listings a report covers: everything, one home with its rooms, or one room. */
export function scopeListings(listings: Listing[], f: Filters): Listing[] {
  if (f.room) return listings.filter(l => l.id === f.room);
  if (f.property) return listings.filter(l => l.id === f.property || l.parent_id === f.property);
  return listings;
}

export const placeName = (listings: Listing[], id: string) => {
  const l = listings.find(x => x.id === id);
  if (!l) return "";
  const h = l.parent_id ? listings.find(x => x.id === l.parent_id) : null;
  return h ? `${h.title} › ${l.title}` : l.title;
};

type SevgioRaw = { id: string; code: string; property_id: string; guest_name: string; check_in: string; check_out: string; nights: number; guests: number;
  lodging_cents: number; discount_cents: number; cleaning_fee_cents: number; pet_fee_cents: number; services_cents: number; tax_cents: number; total_cents: number;
  paid_cents: number; payment_method: string | null; management_fee_percent: number };
type PlatformRaw = { id: string; channel: string; external_ref: string; property_id: string; guest_name: string; check_in: string; check_out: string; guests: number | null; status: "confirmed" | "cancelled";
  rent_cents: number | null; cleaning_cents: number | null; other_cents: number | null; tax_cents: number | null; commission_cents: number | null; refund_cents: number | null;
  expected_payout_cents: number | null; received_payout_cents: number | null; payout_date: string | null; finance_source: string };

/** Every reservation that checks in between `from` and `to` (inclusive), for the listings and site chosen. */
export async function reportRows(listings: Listing[], f: Filters): Promise<ReportRow[]> {
  const ids = scopeListings(listings, f).map(l => l.id);
  if (!ids.length) return [];
  const end = addDays(f.to, 1);
  const pct = new Map(listings.map(l => [l.id, Number(l.management_fee_percent) || 0]));
  const [direct, platform] = await Promise.all([
    f.channel && f.channel !== "sevgio" ? [] : q<SevgioRaw>(
      `SELECT id, code, property_id, guest_name, check_in, check_out, nights, guests, lodging_cents, discount_cents, cleaning_fee_cents, pet_fee_cents, services_cents,
              tax_cents, total_cents, paid_cents, payment_method, management_fee_percent
       FROM bookings WHERE status = 'confirmed' AND property_id = ANY($1) AND check_in >= $2 AND check_in < $3`, [ids, f.from, end]),
    f.channel === "sevgio" ? [] : q<PlatformRaw>(
      // Cancelled stays are listed only when money changed hands (a cancellation fee or a refund was recorded).
      `SELECT id, channel, external_ref, property_id, guest_name, check_in, check_out, guests, status, rent_cents, cleaning_cents, other_cents, tax_cents,
              commission_cents, refund_cents, expected_payout_cents, received_payout_cents, payout_date, finance_source
       FROM channel_stays WHERE eff_kind = 'reservation' AND (status = 'confirmed' OR finance_source <> 'none')
         AND property_id = ANY($1) AND check_in >= $2 AND check_in < $3 AND ($4::text IS NULL OR channel = $4)`, [ids, f.from, end, f.channel]),
  ]);
  const rows: ReportRow[] = [
    ...direct.map(b => {
      const rent = b.lodging_cents - b.discount_cents, mgmt = Number(b.management_fee_percent);
      const fee = Math.round((rent * mgmt) / 100), other = b.pet_fee_cents + b.services_cents;
      return {
        id: b.id, source: "sevgio" as const, channel: "sevgio", channelLabel: channelLabel("sevgio"), ref: b.code, href: `/trips/${b.code}`,
        property_id: b.property_id, place: placeName(listings, b.property_id), guest_name: b.guest_name, check_in: b.check_in, check_out: b.check_out, nights: b.nights, guests: b.guests,
        status: "confirmed" as const, rent, cleaning: b.cleaning_fee_cents, other, tax: b.tax_cents, commission: 0, refund: 0,
        // Guests pay Sevgio directly; payments are tracked only when online or recorded payments are used.
        expected: b.total_cents, received: b.payment_method ? b.paid_cents : null, payout_date: null,
        mgmtPercent: mgmt, fee, owner: rent + b.cleaning_fee_cents + other - fee, needsEntry: false,
      };
    }),
    ...platform.map(r => {
      const mgmt = pct.get(r.property_id) ?? 0;
      const entered = r.finance_source !== "none";
      const fee = r.rent_cents == null ? null : Math.round((r.rent_cents * mgmt) / 100);
      // Once payout details are entered, a fee the site didn't charge (left blank) counts as none.
      const z = (v: number | null) => (v == null && entered ? 0 : v);
      const parts = [r.rent_cents, z(r.cleaning_cents), z(r.other_cents), z(r.commission_cents), z(r.refund_cents)];
      const owner = fee == null || parts.some(v => v == null) ? null : parts[0]! + parts[1]! + parts[2]! - parts[3]! - parts[4]! - fee;
      return {
        id: r.id, source: "platform" as const, channel: r.channel, channelLabel: channelLabel(r.channel), ref: r.external_ref, href: `/host/bookings/other-sites/${r.id}`,
        property_id: r.property_id, place: placeName(listings, r.property_id), guest_name: r.guest_name, check_in: r.check_in, check_out: r.check_out,
        nights: nightsBetween(r.check_in, r.check_out), guests: r.guests, status: r.status,
        rent: r.rent_cents, cleaning: z(r.cleaning_cents), other: z(r.other_cents), tax: z(r.tax_cents), commission: z(r.commission_cents), refund: z(r.refund_cents),
        expected: r.expected_payout_cents, received: r.received_payout_cents ?? (entered ? 0 : null), payout_date: r.payout_date,
        mgmtPercent: mgmt, fee, owner, needsEntry: r.rent_cents == null || r.expected_payout_cents == null,
      };
    }),
  ];
  return rows.sort((a, b) => a.check_in.localeCompare(b.check_in) || a.place.localeCompare(b.place));
}

export function totals(rows: ReportRow[]): Totals {
  const t = { bookings: rows.filter(r => r.status === "confirmed").length, cancelled: rows.filter(r => r.status === "cancelled").length } as Totals;
  for (const k of MONEY_KEYS) t[k] = rows.reduce((a, r) => (r[k] == null ? { ...a, missing: a.missing + 1 } : { ...a, cents: a.cents + r[k]!, known: a.known + 1 }), { cents: 0, missing: 0, known: 0 });
  return t;
}

export type Occupancy = { bookedNights: number; booked: number; blocked: number; unknown: number; capacity: number; percent: number | null };

/** Booked, blocked and unclear nights inside the period, without counting a whole home and its rooms twice. */
export async function occupancyFor(listings: Listing[], f: Filters, scope = scopeListings(listings, f)): Promise<Occupancy> {
  const units = unitsOf(scope);
  if (!units.length) return { bookedNights: 0, booked: 0, blocked: 0, unknown: 0, capacity: 0, percent: null };
  const end = addDays(f.to, 1);
  // A room is also taken when its whole home is booked or blocked.
  const ids = [...new Set([...scope.map(l => l.id), ...scope.map(l => l.parent_id).filter((x): x is string => !!x)])];
  const raw = await q<{ property_id: string; from: string; to: string; kind: NightStay["kind"]; channel: string }>(
    `SELECT property_id, check_in AS from, check_out AS to, 'booked' AS kind, 'sevgio' AS channel FROM bookings
       WHERE status = 'confirmed' AND property_id = ANY($1) AND check_in < $3 AND check_out > $2
     UNION ALL
     SELECT property_id, check_in, check_out, CASE eff_kind WHEN 'reservation' THEN 'booked' ELSE eff_kind END, channel FROM channel_stays
       WHERE status = 'confirmed' AND eff_kind <> 'mirror' AND property_id = ANY($1) AND check_in < $3 AND check_out > $2
     UNION ALL
     SELECT property_id, start_date, end_date, 'blocked', '' FROM blocks
       WHERE source = 'host' AND property_id = ANY($1) AND start_date < $3 AND end_date > $2`,
    [ids, f.from, end]);
  // With a site chosen, only that site's stays count as booked; blocked dates always count.
  const stays = raw.filter(s => s.kind !== "booked" || !f.channel || s.channel === f.channel);
  const o = occupancy(units, stays, f.from, end);
  const inScope = new Set(scope.map(l => l.id));
  const bookedNights = stays.filter(s => s.kind === "booked" && inScope.has(s.property_id))
    .reduce((n, s) => n + nightsBetween(s.from > f.from ? s.from : f.from, s.to < end ? s.to : end), 0);
  return { bookedNights, ...o };
}

/** What's still missing before the numbers are complete, for the listings in the report. */
export async function dataGaps(listings: Listing[], f: Filters) {
  const ids = scopeListings(listings, f).map(l => l.id);
  if (!ids.length) return { needsEntry: 0, unclear: 0, feedErrors: [] as { name: string; place: string; error: string }[] };
  const end = addDays(f.to, 1);
  const [counts, feeds] = await Promise.all([
    q<{ needs: number; unclear: number }>(
      `SELECT count(*) FILTER (WHERE eff_kind = 'reservation' AND (rent_cents IS NULL OR expected_payout_cents IS NULL))::int AS needs,
              count(*) FILTER (WHERE eff_kind = 'unknown')::int AS unclear
       FROM channel_stays WHERE status = 'confirmed' AND property_id = ANY($1) AND check_in < $3 AND check_out > $2 AND ($4::text IS NULL OR channel = $4)`,
      [ids, f.from, end, f.channel === "sevgio" ? "none" : f.channel]),
    q<{ name: string; property_id: string; error: string }>("SELECT name, property_id, last_error AS error FROM ical_feeds WHERE property_id = ANY($1) AND last_error IS NOT NULL", [ids]),
  ]);
  return { needsEntry: counts[0].needs, unclear: counts[0].unclear, feedErrors: feeds.map(x => ({ name: x.name, place: placeName(listings, x.property_id), error: x.error })) };
}

/** Months from `from`'s month to `to`'s month, e.g. ["2026-01", …]. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7) && out.length < 60; m = monthRange(m).next.slice(0, 7)) out.push(m);
  return out;
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  // Prevent spreadsheet formula injection from guest-entered names.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const d = (c: number | null) => (c == null ? "Needs entry" : (c / 100).toFixed(2));

/** The statement as a spreadsheet: the same rows and totals as the Finance page. */
export function statementCsv(rows: ReportRow[]): string {
  const head = ["Booked on", "Reference", "Listing", "Guest", "Check-in", "Check-out", "Nights", "Status", "Rent", "Cleaning fee", "Other charges", "Tax", "Platform commission",
    "Refunds", "Expected payout", "Received payout", "Payout date", "Management fee %", "Management fee", "Owner payout"];
  const body = rows.map(r => [r.channelLabel, r.ref, r.place, r.guest_name, r.check_in, r.check_out, r.nights, r.status === "cancelled" ? "Cancelled" : "Confirmed",
    d(r.rent), d(r.cleaning), d(r.other), d(r.tax), d(r.commission), d(r.refund), d(r.expected), r.received == null ? "Not recorded" : d(r.received), r.payout_date ?? "",
    r.mgmtPercent, d(r.fee), d(r.owner)]);
  const t = totals(rows);
  const tot = (k: MoneyKey) => (t[k].cents / 100).toFixed(2) + (t[k].missing ? ` (+${t[k].missing} need entry)` : "");
  const foot = ["Total", `${t.bookings} reservations`, "", "", "", "", rows.reduce((n, r) => n + r.nights, 0), "", tot("rent"), tot("cleaning"), tot("other"), tot("tax"),
    tot("commission"), tot("refund"), tot("expected"), tot("received"), "", "", tot("fee"), tot("owner")];
  return [head, ...body, foot].map(line => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

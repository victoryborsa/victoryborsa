import { addDays, isIsoDate } from "./dates.ts";

/**
 * Reads payout and earnings files exported from Airbnb, Vrbo, Booking.com and similar sites.
 * Column names differ by site, so each column is matched by name, and the person importing can change any match.
 */

export const FIELDS = [
  ["ref", "Confirmation code"], ["check_in", "Check-in"], ["check_out", "Check-out"], ["nights", "Nights"], ["guest", "Guest name"], ["listing", "Listing name"],
  ["guests", "Number of guests"], ["type", "Row type"], ["status", "Reservation status"],
  ["gross", "Gross / total price"], ["rent", "Rent (nightly total)"], ["cleaning", "Cleaning fee"], ["other", "Other charges"], ["tax", "Taxes"],
  ["commission", "Commission / service fee"], ["commission2", "Extra site fee (e.g. Fast Pay)"], ["refund", "Refund"],
  ["payout", "Payout amount"], ["received", "Amount paid out"], ["payout_date", "Payout date"],
] as const;
export type Field = (typeof FIELDS)[number][0];
export type Mapping = Partial<Record<Field, number>>;

/** Column names each site uses, lowercased with punctuation removed. Earlier names win when a file has several. */
const NAMES: Record<Field, string[]> = {
  ref: ["confirmation code", "reservation id", "reservation number", "reservation code", "book number", "booking number", "booking id", "booking reference", "confirmation number", "reference number", "confirmation", "reference"],
  check_in: ["start date", "check in", "checkin", "check in date", "arrival", "arrival date", "stay start date", "from"],
  check_out: ["end date", "check out", "checkout", "check out date", "departure", "departure date", "stay end date", "to"],
  nights: ["nights", "number of nights", "of nights", "length of stay", "room nights"],
  guest: ["guest", "guest name", "guest names", "guest name s", "traveler", "traveler name", "booker name", "booked by", "name"],
  listing: ["listing", "listing name", "property", "property name", "unit", "unit name", "accommodation", "room name", "room"],
  guests: ["guests", "number of guests", "people", "persons", "guest count"],
  type: ["type", "transaction type", "line type", "entry type"],
  status: ["status", "reservation status", "booking status"],
  gross: ["gross earnings", "gross amount", "gross revenue", "gross booking value", "total price", "price", "booking amount", "total amount", "original amount", "total"],
  rent: ["rent", "rental amount", "accommodation amount", "room revenue", "base rate", "nightly rate total", "lodging"],
  cleaning: ["cleaning fee", "cleaning fees", "cleaning"],
  other: ["pet fee", "other fees", "extra fees", "additional fees", "extras", "other charges", "guest fees"],
  tax: ["occupancy taxes", "occupancy tax", "taxes", "tax", "lodging tax", "pass through tot", "taxes and fees"],
  commission: ["service fee", "host fee", "host service fee", "commission amount", "commission", "channel fee", "platform fee", "booking com commission"],
  commission2: ["fast pay fee", "payment charge", "payment processing fee", "transaction fee"],
  refund: ["refund", "refunds", "refunded amount", "refund amount"],
  payout: ["amount", "payout", "payout amount", "net amount", "net payout", "expected payout", "total payout", "your earnings", "earnings", "net earnings", "host payout"],
  received: ["paid out", "amount paid out", "paid amount", "received", "amount received"],
  payout_date: ["payout date", "paid date", "paid out date", "transfer date", "date"],
};

const norm = (h: string) => h.toLowerCase().replace(/^﻿/, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Splits a CSV (comma, semicolon or tab separated; quotes and line breaks inside quotes are handled). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const first = src.split(/\r?\n/, 1)[0] || "";
  const count = (ch: string) => first.split(ch).length;
  const sep = count("\t") > count(",") && count("\t") > count(";") ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(c => c.trim() !== "")) rows.push(row.map(c => c.trim()));
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== "")) rows.push(row.map(c => c.trim()));
  return rows;
}

/** Guesses which column holds each field. */
export function guessMapping(headers: string[]): Mapping {
  const h = headers.map(norm), used = new Set<number>(), m: Mapping = {};
  for (const [field] of FIELDS) {
    for (const name of NAMES[field]) {
      const i = h.findIndex((x, j) => !used.has(j) && x === name);
      if (i >= 0) { m[field] = i; used.add(i); break; }
    }
  }
  return m;
}

/** "$1,234.56" → 123456 cents; "(12.00)" and "-12" are negative. Blank or unreadable → null. */
export function parseMoney(v: string | undefined): number | null {
  if (v == null) return null;
  let s = v.trim();
  if (!s || s === "-" || /^n\/?a$/i.test(s)) return null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  s = s.replace(/[()\s$€£]|USD|EUR/gi, "").replace(/^-|-$/g, "");
  // 1.234,56 (European) → 1234.56
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) * (neg ? -1 : 1);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Dates as sites write them: 2026-10-04, 10/04/2026 (US order unless the first number is over 12), 4 Oct 2026, Oct 4, 2026. */
export function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim().replace(/T.*$/, "").replace(/\s+\d{1,2}:\d{2}.*$/, "");
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number, d: number) => { const iso = `${y}-${pad(m)}-${pad(d)}`; return isIsoDate(iso) && new Date(iso + "T00:00:00Z").getUTCDate() === d ? iso : null; };
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return +m[1] > 12 ? ok(y, +m[2], +m[1]) : ok(y, +m[1], +m[2]);
  }
  m = s.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i);
  if (m && MONTHS.includes(m[2].toLowerCase())) return ok(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  m = s.match(/^(?:[a-z]+,?\s+)?([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (m && MONTHS.includes(m[1].toLowerCase())) return ok(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  return null;
}

/** One reservation's figures, after adding up all of its rows in the file. Amounts are in cents; null = not in the file. */
export type PayoutRecord = {
  key: string; ref: string; check_in: string | null; check_out: string | null; guest: string; listing: string; guests: number | null; cancelled: boolean;
  rent: number | null; cleaning: number | null; other: number | null; tax: number | null; commission: number | null; refund: number | null;
  payout: number | null; received: number | null; payout_date: string | null; lines: number;
};
export type Skipped = { line: number; reason: string };

const add = (a: number | null, b: number | null) => (b == null ? a : (a ?? 0) + b);

/**
 * Turns file rows into one record per reservation. Sites often put several lines per reservation
 * (Airbnb: the reservation, then adjustments or resolution payments), so lines with the same confirmation code are added up.
 * Lines that are bank transfers (Airbnb "Payout" lines) carry no reservation and are skipped.
 */
export function toRecords(rows: string[][], m: Mapping): { records: PayoutRecord[]; skipped: Skipped[] } {
  const out = new Map<string, PayoutRecord>(), skipped: Skipped[] = [];
  const cell = (r: string[], f: Field) => (m[f] == null ? undefined : r[m[f]!]);
  rows.forEach((r, i) => {
    const line = i + 2;
    const type = (cell(r, "type") || "").toLowerCase();
    if (/^payout$|transfer|withdrawal/.test(type)) { skipped.push({ line, reason: "Bank transfer line (not a reservation)" }); return; }
    const ref = (cell(r, "ref") || "").trim().toUpperCase();
    const ci = parseDate(cell(r, "check_in"));
    const nights = Number(cell(r, "nights")) || 0;
    const co = parseDate(cell(r, "check_out")) || (ci && nights > 0 ? addDays(ci, nights) : null);
    if (!ref && !ci) { skipped.push({ line, reason: "No confirmation code or check-in date" }); return; }
    const key = ref || `${ci}|${co}|${(cell(r, "listing") || "").toLowerCase()}`;
    const rec = out.get(key) || { key, ref, check_in: null, check_out: null, guest: "", listing: "", guests: null, cancelled: false,
      rent: null, cleaning: null, other: null, tax: null, commission: null, refund: null, payout: null, received: null, payout_date: null, lines: 0 };
    rec.lines++;
    rec.check_in ||= ci; rec.check_out ||= co;
    rec.guest ||= (cell(r, "guest") || "").slice(0, 80); rec.listing ||= (cell(r, "listing") || "").slice(0, 200);
    rec.guests ??= Number(cell(r, "guests")) > 0 ? Math.round(Number(cell(r, "guests"))) : null;
    if (/cancel/i.test(cell(r, "status") || "") || /cancel/.test(type)) rec.cancelled = true;
    const money = (f: Field) => parseMoney(cell(r, f));
    const amount = money("payout");
    // Adjustment and refund lines: a negative amount is money given back to the guest.
    if (/adjust|resolution|refund/.test(type)) {
      if (amount != null && amount < 0) rec.refund = add(rec.refund, -amount);
      else rec.payout = add(rec.payout, amount);
      rec.received = add(rec.received, money("received"));
      out.set(key, rec);
      return;
    }
    const cleaning = money("cleaning"), other = money("other"), gross = money("gross");
    rec.cleaning = add(rec.cleaning, cleaning);
    rec.other = add(rec.other, other);
    rec.tax = add(rec.tax, money("tax"));
    const fees = [money("commission"), money("commission2")].filter((x): x is number => x != null).map(Math.abs);
    if (fees.length) rec.commission = add(rec.commission, fees.reduce((a, b) => a + b, 0));
    const refund = money("refund");
    if (refund != null) rec.refund = add(rec.refund, Math.abs(refund));
    // Rent: its own column, or the gross price less cleaning and other charges.
    const rent = money("rent") ?? (gross != null ? gross - (cleaning ?? 0) - (other ?? 0) : null);
    rec.rent = add(rec.rent, rent);
    rec.payout = add(rec.payout, amount);
    rec.received = add(rec.received, money("received"));
    rec.payout_date ||= parseDate(cell(r, "payout_date"));
    out.set(key, rec);
  });
  return { records: [...out.values()], skipped };
}

/** Which listing a file's listing name means: exact title, then a title containing it (or contained in it). */
export function matchListing<T extends { id: string; title: string }>(name: string, listings: T[]): T | null {
  const n = norm(name);
  if (!n) return null;
  const exact = listings.filter(l => norm(l.title) === n);
  if (exact.length === 1) return exact[0];
  const partial = listings.filter(l => { const t = norm(l.title); return t && (t.includes(n) || n.includes(t)); });
  return partial.length === 1 ? partial[0] : null;
}

import "server-only";
import { q } from "./db.ts";
import type { User } from "./auth.ts";
import { payout } from "./pricing.ts";

/** Statements count confirmed bookings by their check-in month. */
export type StatementRow = {
  id: string; code: string; property_id: string; title: string; guest_name: string; check_in: string; check_out: string; nights: number; guests: number;
  lodging_cents: number; discount_cents: number; cleaning_fee_cents: number; tax_cents: number; total_cents: number; management_fee_percent: number;
  rent: number; fee: number; owner: number;
};

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, next, days };
}

export const validMonth = (s: unknown) => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

function scope(u: User, propertyId: string | null, params: unknown[]) {
  const where: string[] = [];
  if (u.role !== "admin") { params.push(u.id); where.push(`p.host_id = $${params.length}`); }
  if (propertyId) { params.push(propertyId); where.push(`p.id = $${params.length}`); }
  return where.length ? where.join(" AND ") : "TRUE";
}

export async function statement(u: User, month: string, propertyId: string | null): Promise<StatementRow[]> {
  const { start, next } = monthRange(month);
  const params: unknown[] = [start, next];
  const rows = await q<Omit<StatementRow, "rent" | "fee" | "owner">>(
    `SELECT b.id, b.code, b.property_id, p.title, b.guest_name, b.check_in, b.check_out, b.nights, b.guests, b.lodging_cents, b.discount_cents,
            b.cleaning_fee_cents + b.pet_fee_cents + b.services_cents AS cleaning_fee_cents, b.tax_cents, b.total_cents, b.management_fee_percent
     FROM bookings b JOIN properties p ON p.id = b.property_id
     WHERE b.status = 'confirmed' AND b.check_in >= $1 AND b.check_in < $2 AND ${scope(u, propertyId, params)}
     ORDER BY b.check_in, p.title`,
    params,
  );
  return rows.map(r => ({ ...r, ...payout(r) }));
}

export type PropertySummary = { id: string; title: string; bookings: number; nights: number; occupancy: number; rent: number; cleaning: number; tax: number; fee: number; owner: number };

export async function propertySummaries(u: User, month: string, propertyId: string | null, rows: StatementRow[]): Promise<PropertySummary[]> {
  const { start, next, days } = monthRange(month);
  const params: unknown[] = [start, next];
  // Nights actually spent in this month (a stay crossing month-end counts in both months for occupancy).
  const occ = await q<{ id: string; title: string; nights: number }>(
    `SELECT p.id, p.title, count(d.d)::int AS nights
     FROM properties p
     LEFT JOIN bookings b ON b.property_id = p.id AND b.status = 'confirmed' AND b.check_in < $2 AND b.check_out > $1
     LEFT JOIN LATERAL generate_series(greatest(b.check_in, $1::date), least(b.check_out, $2::date) - 1, interval '1 day') d(d) ON b.id IS NOT NULL
     WHERE ${scope(u, propertyId, params)}
     GROUP BY p.id, p.title ORDER BY p.title`,
    params,
  );
  return occ.map(o => {
    const mine = rows.filter(r => r.property_id === o.id);
    const sum = (k: "rent" | "cleaning_fee_cents" | "tax_cents" | "fee" | "owner") => mine.reduce((n, r) => n + Number(r[k]), 0);
    return { id: o.id, title: o.title, bookings: mine.length, nights: o.nights, occupancy: Math.round((o.nights / days) * 100), rent: sum("rent"), cleaning: sum("cleaning_fee_cents"), tax: sum("tax_cents"), fee: sum("fee"), owner: sum("owner") };
  });
}

export type MonthOverview = { month: string; bookings: number; nights: number; rent: number; fee: number; owner: number };

/** The last 12 months, by check-in month. */
export async function yearOverview(u: User, endMonth: string, propertyId: string | null): Promise<MonthOverview[]> {
  const { next } = monthRange(endMonth);
  const [y, m] = endMonth.split("-").map(Number);
  const startMonth = m === 12 ? `${y}-01` : `${y - 1}-${String(m + 1).padStart(2, "0")}`;
  const params: unknown[] = [monthRange(startMonth).start, next];
  const rows = await q<Omit<StatementRow, "rent" | "fee" | "owner"> & { month: string }>(
    `SELECT to_char(b.check_in, 'YYYY-MM') AS month, b.nights, b.lodging_cents, b.discount_cents, b.cleaning_fee_cents + b.pet_fee_cents + b.services_cents AS cleaning_fee_cents, b.management_fee_percent
     FROM bookings b JOIN properties p ON p.id = b.property_id
     WHERE b.status = 'confirmed' AND b.check_in >= $1 AND b.check_in < $2 AND ${scope(u, propertyId, params)}`,
    params,
  );
  const out: MonthOverview[] = [];
  for (let i = 0; i < 12; i++) {
    const mm = ((m - 1 + i + 1) % 12) + 1, yy = y - 1 + Math.floor((m + i) / 12);
    const key = `${yy}-${String(mm).padStart(2, "0")}`;
    const mine = rows.filter(r => r.month === key).map(r => ({ ...r, ...payout(r) }));
    out.push({ month: key, bookings: mine.length, nights: mine.reduce((n, r) => n + r.nights, 0), rent: mine.reduce((n, r) => n + r.rent, 0), fee: mine.reduce((n, r) => n + r.fee, 0), owner: mine.reduce((n, r) => n + r.owner, 0) });
  }
  return out;
}

export async function financeProperties(u: User) {
  return u.role === "admin"
    ? q<{ id: string; title: string }>("SELECT id, title FROM properties ORDER BY title")
    : q<{ id: string; title: string }>("SELECT id, title FROM properties WHERE host_id = $1 ORDER BY title", [u.id]);
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  // Prevent spreadsheet formula injection from guest-entered names.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export function statementCsv(rows: StatementRow[]): string {
  const d = (c: number) => (c / 100).toFixed(2);
  const head = ["Reference", "Listing", "Guest", "Check-in", "Check-out", "Nights", "Guests", "Rent", "Discount", "Rent after discount", "Cleaning, pet fees & extras", "Tax collected", "Guest total", "Management fee %", "Management fee", "Owner payout"];
  const body = rows.map(r => [r.code, r.title, r.guest_name, r.check_in, r.check_out, r.nights, r.guests, d(r.lodging_cents), d(r.discount_cents), d(r.rent), d(r.cleaning_fee_cents), d(r.tax_cents), d(r.total_cents), r.management_fee_percent, d(r.fee), d(r.owner)]);
  return [head, ...body].map(line => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

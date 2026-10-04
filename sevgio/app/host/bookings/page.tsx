import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { scopeSql } from "@/lib/access.ts";
import { expireStaleRequests } from "@/lib/bookings.ts";
import { todayLocal } from "@/lib/dates.ts";
import { Flash } from "@/components/Flash.tsx";
import { BookingTable, type BookingRow } from "@/components/BookingTable.tsx";
import { markSeen } from "@/lib/alerts.ts";
import { BookingTabs } from "@/components/BookingTabs.tsx";

const VIEWS: Record<string, { label: string; where: string; order: string }> = {
  upcoming: { label: "Upcoming", where: "b.status IN ('pending','awaiting_payment','confirmed') AND b.check_out >= $T", order: "b.check_in" },
  requests: { label: "Requests", where: "b.status = 'pending'", order: "b.created_at" },
  past: { label: "Past", where: "b.status = 'confirmed' AND b.check_out < $T", order: "b.check_in DESC" },
  cancelled: { label: "Cancelled & declined", where: "b.status IN ('cancelled','declined','expired')", order: "b.updated_at DESC" },
};

export default async function HostBookings({ searchParams }: { searchParams: Promise<{ view?: string; msg?: string }> }) {
  const u = await requireUser(["host", "admin"], "/host/bookings");
  await expireStaleRequests();
  const view = VIEWS[(await searchParams).view || ""] ? (await searchParams).view! : "upcoming";
  const v = VIEWS[view];
  const s = scopeSql(u);
  const T = "$" + (s.params.length + 1);
  const rows = await q<BookingRow>(
    `SELECT b.*, p.title, g.email AS guest_email FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.guest_id
     WHERE ${s.sql} AND ${v.where.replaceAll("$T", T)} ORDER BY ${v.order} LIMIT 300`,
    v.where.includes("$T") ? [...s.params, todayLocal()] : s.params,
  );
  const fresh = await markSeen(rows.filter(r => ["pending", "awaiting_payment", "confirmed"].includes(r.status)).map(r => r.id));
  return (
    <>
      <Flash msg={(await searchParams).msg} />
      <BookingTabs current={view} />
      {fresh.size > 0 && <div className="notice ok" role="status" style={{ marginBottom: 16 }}>{fresh.size} new booking{fresh.size === 1 ? "" : "s"} since you last looked, marked <b>New</b> below.</div>}
      <BookingTable fresh={fresh} rows={rows} today={todayLocal()} back={`/host/bookings?view=${view}`} />
      <p className="hint" style={{ marginTop: 10 }}>Guest phone numbers and emails are shown only for active bookings.</p>
    </>
  );
}

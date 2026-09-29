import { requireUser } from "@/lib/auth.ts";
import Link from "next/link";
import { q } from "@/lib/db.ts";
import { todayLocal } from "@/lib/dates.ts";
import { Flash } from "@/components/Flash.tsx";
import { BookingTable, type BookingRow } from "@/components/BookingTable.tsx";

const STATUSES = ["all", "pending", "confirmed", "cancelled", "declined", "expired"];

export default async function AdminBookings({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; msg?: string }> }) {
  await requireUser(["admin"], "/admin");
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status || "") ? sp.status! : "all";
  const term = (sp.q || "").trim().slice(0, 80);
  const rows = await q<BookingRow>(
    `SELECT b.*, p.title, g.email AS guest_email FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.guest_id
     WHERE ($1 = 'all' OR b.status = $1) AND ($2 = '' OR b.code ILIKE '%' || $2 || '%' OR b.guest_name ILIKE '%' || $2 || '%' OR g.email ILIKE '%' || $2 || '%' OR p.title ILIKE '%' || $2 || '%')
     ORDER BY b.check_in DESC LIMIT 300`,
    [status, term],
  );
  return (
    <>
      <Flash msg={sp.msg} />
      <form className="row" method="get" style={{ marginBottom: 16 }}>
        <input className="input" name="q" defaultValue={term} placeholder="Reference, guest or listing" style={{ maxWidth: 320 }} />
        <select className="input" name="status" defaultValue={status} style={{ width: "auto" }}>{STATUSES.map(s => <option key={s} value={s}>{s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}</option>)}</select>
        <button className="btn btn-ghost">Filter</button>
        {(term || status !== "all") && <Link href="/admin/bookings">Clear</Link>}
      </form>
      <BookingTable rows={rows} today={todayLocal()} back={`/admin/bookings?status=${status}`} />
    </>
  );
}

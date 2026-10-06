import { requireUser } from "@/lib/auth.ts";
import Link from "next/link";
import { q } from "@/lib/db.ts";
import { todayLocal } from "@/lib/dates.ts";
import { Flash } from "@/components/Flash.tsx";
import { BookingTable, type BookingRow } from "@/components/BookingTable.tsx";
import { markSeen } from "@/lib/alerts.ts";
import { searchReservations } from "@/lib/reservation-search.ts";
import { ReservationResults, ReservationSearchForm } from "@/components/ReservationResults.tsx";
import type { Phase } from "@/lib/booking-ref.ts";
import { MissingNames } from "@/components/MissingNames.tsx";

const STATUSES = ["all", "pending", "awaiting_payment", "confirmed", "cancelled", "declined", "expired"];
const PHASES = ["all", "upcoming", "current", "past", "cancelled"];

export default async function AdminBookings({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; when?: string; msg?: string }> }) {
  await requireUser(["admin"], "/admin");
  const sp = await searchParams;
  const term = (sp.q || "").trim().slice(0, 80);
  const phase = PHASES.includes(sp.when || "") ? sp.when! : "all";
  // Searching or picking a time filter shows the reservation finder results (Sevgio and other sites together).
  if (term || phase !== "all") {
    const found = await searchReservations(term, todayLocal(), { phase: phase as Phase | "all" });
    const qs = new URLSearchParams({ ...(term ? { q: term } : {}), ...(phase !== "all" ? { when: phase } : {}) }).toString();
    return (
      <>
        <Flash msg={sp.msg} />
        <ReservationSearchForm term={term} phase={phase} />
        {!term && <MissingNames propertyIds={null} today={todayLocal()} />}
        <div className="row rs-count" role="status">
          <span><b>{found.length === 100 ? "100+" : found.length}</b> reservation{found.length === 1 ? "" : "s"}{term ? <> matching “{term}”</> : null}</span>
          <span className="spacer" />
          <Link href="/admin/bookings">Clear search</Link>
        </div>
        {found.length ? <ReservationResults rows={found} back={`/admin/bookings?${qs}`} /> : (
          <div className="empty"><h3>No reservations found</h3><p className="muted">Check the spelling, try just the first or last name, or the last few characters of the reference.</p></div>
        )}
      </>
    );
  }
  const status = STATUSES.includes(sp.status || "") ? sp.status! : "all";
  const rows = await q<BookingRow>(
    `SELECT b.*, p.title, g.email AS guest_email FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.guest_id
     WHERE ($1 = 'all' OR b.status = $1)
     ORDER BY b.check_in DESC LIMIT 300`,
    [status],
  );
  const fresh = await markSeen(rows.filter(r => ["pending", "awaiting_payment", "confirmed"].includes(r.status)).map(r => r.id));
  return (
    <>
      <Flash msg={sp.msg} />
      <ReservationSearchForm term="" phase="all" />
      <MissingNames propertyIds={null} today={todayLocal()} />
      <h2 className="rs-subh">All Sevgio.com bookings</h2>
      <form className="row" method="get" style={{ marginBottom: 16 }}>
        <select className="input" name="status" defaultValue={status} style={{ width: "auto" }}>{STATUSES.map(s => <option key={s} value={s}>{s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}</option>)}</select>
        <button className="btn btn-ghost">Filter</button>
        {status !== "all" && <Link href="/admin/bookings">Clear</Link>}
        <span className="spacer" />
        <Link className="btn btn-ghost" href="/host/bookings/other-sites">Reservations from other sites</Link>
      </form>
      {fresh.size > 0 && <div className="notice ok" role="status" style={{ marginBottom: 16 }}>{fresh.size} new booking{fresh.size === 1 ? "" : "s"} since you last looked, marked <b>New</b> below.</div>}
      <BookingTable fresh={fresh} rows={rows} today={todayLocal()} back={`/admin/bookings?status=${status}`} detailBase="/admin/bookings/" />
    </>
  );
}

import Link from "next/link";
import { ColorIcon } from "@/components/Icon.tsx";
import { requireUser } from "@/lib/auth.ts";
import { q, one } from "@/lib/db.ts";
import { scopeSql } from "@/lib/access.ts";
import { expireStaleRequests } from "@/lib/bookings.ts";
import { addDays, todayLocal } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";
import { Flash } from "@/components/Flash.tsx";
import { BookingTable, type BookingRow } from "@/components/BookingTable.tsx";

export default async function HostHome({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const u = await requireUser(["host", "admin"], "/host");
  await expireStaleRequests();
  const today = todayLocal();
  const s = scopeSql(u);
  const n = s.params.length;
  const [stats] = await q<{ listings: number; live: number; pending: number; upcoming: number; revenue: number; unread: number }>(
    `SELECT (SELECT count(*) FROM properties p WHERE ${s.sql}) AS listings,
            (SELECT count(*) FROM properties p WHERE ${s.sql} AND status = 'published') AS live,
            (SELECT count(*) FROM bookings b JOIN properties p ON p.id = b.property_id WHERE ${s.sql} AND b.status = 'pending') AS pending,
            (SELECT count(*) FROM bookings b JOIN properties p ON p.id = b.property_id WHERE ${s.sql} AND b.status = 'confirmed' AND b.check_out >= $${n + 1}) AS upcoming,
            (SELECT coalesce(sum(b.total_cents), 0) FROM bookings b JOIN properties p ON p.id = b.property_id WHERE ${s.sql} AND b.status = 'confirmed' AND b.check_out >= $${n + 1}) AS revenue,
            (SELECT count(*) FROM messages m JOIN properties p ON p.id = m.property_id WHERE ${s.sql} AND NOT m.handled) AS unread`,
    [...s.params, today],
  );
  const requests = await q<BookingRow>(
    `SELECT b.*, p.title, g.email AS guest_email FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.guest_id
     WHERE ${s.sql} AND b.status = 'pending' ORDER BY b.created_at`, s.params);
  const arrivals = await q<BookingRow>(
    `SELECT b.*, p.title, g.email AS guest_email FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.guest_id
     WHERE ${s.sql} AND b.status = 'confirmed' AND b.check_in BETWEEN $${n + 1} AND $${n + 2} ORDER BY b.check_in`, [...s.params, today, addDays(today, 14)]);
  // Admins open the full reservation page; hosts open the booking page they share with the guest.
  const detailBase = u.role === "admin" ? "/admin/bookings/" : "/trips/";
  const noPhotos = await one<{ n: number }>(`SELECT count(*) AS n FROM properties p WHERE ${s.sql} AND NOT EXISTS (SELECT 1 FROM photos ph WHERE ph.property_id = p.id)`, s.params);

  return (
    <>
      <Flash msg={(await searchParams).msg} />
      <div className="stats">
        <Link className="stat stat-link" href="/host/listings"><b>{stats.live}/{stats.listings}</b><span><ColorIcon file="listings" size={20} />Listings live</span></Link>
        <Link className="stat stat-link" href="/host/bookings?view=requests"><b style={{ color: stats.pending ? "var(--warn)" : undefined }}>{stats.pending}</b><span><ColorIcon file="inbox" size={20} />Requests waiting for you</span></Link>
        <Link className="stat stat-link" href="/host/bookings?view=upcoming"><b>{stats.upcoming}</b><span><ColorIcon file="calendar" size={20} />Upcoming stays</span></Link>
        <Link className="stat stat-link" href="/host/bookings?view=upcoming"><b className="mono" style={{ fontFamily: "var(--f-mono)", fontWeight: 500 }}>{money(stats.revenue)}</b><span><ColorIcon file="finance" size={20} />Upcoming booking value</span></Link>
        <Link className="stat stat-link" href="/host/messages"><b>{stats.unread}</b><span><ColorIcon file="chats" size={20} />Unanswered questions</span></Link>
      </div>
      {stats.listings === 0 && (
        <div className="empty" style={{ marginBottom: 24 }}>
          <h3>Add your first listing</h3>
          <p className="muted">It takes about 10 minutes: details, photos, then publish.</p>
          <Link className="btn btn-primary" href="/host/listings/new">Add a listing</Link>
        </div>
      )}
      {noPhotos && noPhotos.n > 0 && <div className="notice warn" style={{ marginBottom: 16 }}>{noPhotos.n} listing{noPhotos.n > 1 ? "s have" : " has"} no photos yet. <Link href="/host/listings">Add photos</Link> so guests can book.</div>}
      <h2 style={{ marginBottom: 12 }}>Requests waiting for you</h2>
      {requests.length ? <BookingTable rows={requests} today={today} back="/host" detailBase={detailBase} /> : <p className="muted" style={{ marginBottom: 8 }}>No requests right now. Requests expire after 48 hours without a reply.</p>}
      <h2 style={{ margin: "28px 0 12px" }}>Arrivals in the next 14 days</h2>
      {arrivals.length ? <BookingTable rows={arrivals} today={today} back="/host" detailBase={detailBase} /> : <p className="muted">No arrivals in the next two weeks.</p>}
    </>
  );
}

import { requireUser } from "@/lib/auth.ts";
import Link from "next/link";
import { q } from "@/lib/db.ts";
import { expireStaleRequests } from "@/lib/bookings.ts";
import { todayLocal } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";
import { EventTable, type Ev } from "@/components/EventTable.tsx";

export default async function AdminHome() {
  await requireUser(["admin"], "/admin");
  await expireStaleRequests();
  const today = todayLocal();
  const [s] = await q<Record<string, number>>(
    `SELECT (SELECT count(*) FROM users WHERE role = 'customer') AS customers,
            (SELECT count(*) FROM users WHERE role = 'host') AS hosts,
            (SELECT count(*) FROM properties WHERE status = 'published') AS live,
            (SELECT count(*) FROM properties) AS listings,
            (SELECT count(*) FROM bookings WHERE status = 'pending') AS pending,
            (SELECT count(*) FROM bookings WHERE status = 'confirmed' AND check_out >= $1) AS upcoming,
            (SELECT coalesce(sum(total_cents), 0) FROM bookings WHERE status = 'confirmed' AND created_at > now() - interval '30 days') AS booked30,
            (SELECT count(*) FROM event_log WHERE level = 'error' AND resolved_at IS NULL) AS open_errors,
            (SELECT count(*) FROM messages WHERE NOT handled AND property_id IS NULL) AS new_messages`,
    [today],
  );
  const recent = await q<Ev>("SELECT e.*, u.email FROM event_log e LEFT JOIN users u ON u.id = e.user_id WHERE e.level <> 'info' AND e.resolved_at IS NULL ORDER BY e.at DESC LIMIT 8");
  return (
    <>
      <div className="stats">
        <div className="stat"><b>{s.customers}</b><span>Guests</span></div>
        <div className="stat"><b>{s.hosts}</b><span>Hosts</span></div>
        <div className="stat"><b>{s.live}/{s.listings}</b><span>Listings live</span></div>
        <div className="stat"><b>{s.upcoming}</b><span>Upcoming confirmed stays</span></div>
        <div className="stat"><b style={{ color: s.pending ? "var(--warn)" : undefined }}>{s.pending}</b><span>Requests awaiting hosts</span></div>
        <div className="stat"><b className="mono" style={{ fontFamily: "var(--f-mono)", fontWeight: 500 }}>{money(s.booked30)}</b><span>Booked in the last 30 days</span></div>
        <div className="stat"><b style={{ color: s.open_errors ? "var(--danger)" : undefined }}>{s.open_errors}</b><span><Link href="/admin/log?level=error">Unresolved errors</Link></span></div>
        <div className="stat"><b>{s.new_messages}</b><span><Link href="/admin/messages">New contact messages</Link></span></div>
      </div>
      <h2 style={{ marginBottom: 12 }}>Needs attention</h2>
      {recent.length ? <EventTable rows={recent} /> : <div className="notice ok">No unresolved errors or warnings.</div>}
    </>
  );
}

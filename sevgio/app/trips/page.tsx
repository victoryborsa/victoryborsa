import Link from "next/link";
import { Icon } from "@/components/Icon.tsx";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { expireStaleRequests, type Booking } from "@/lib/bookings.ts";
import { fmtDate, todayLocal } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";
import { photoUrl } from "@/lib/queries.ts";
import { StatusPill } from "@/components/ui.tsx";

export const metadata: Metadata = { title: "My trips" };
export const dynamic = "force-dynamic";

type Row = Booking & { title: string; slug: string; city: string; cover_id: string | null };

export default async function Trips() {
  const u = await requireUser(undefined, "/trips");
  await expireStaleRequests();
  const rows = await q<Row>(
    `SELECT b.*, p.title, p.slug, p.city, (SELECT id FROM photos ph WHERE ph.property_id = p.id ORDER BY position LIMIT 1) AS cover_id
     FROM bookings b JOIN properties p ON p.id = b.property_id WHERE b.guest_id = $1 ORDER BY b.check_in`,
    [u.id],
  );
  const today = todayLocal();
  const upcoming = rows.filter(r => r.check_out >= today && ["pending", "awaiting_payment", "confirmed"].includes(r.status));
  const other = rows.filter(r => !upcoming.includes(r)).reverse();
  // Trip cards in the home page style: photo on top, then the stay, dates, booking code and total.
  const card = (r: Row) => (
    <Link key={r.id} href={`/trips/${r.code}`} className="trip-card">
      <span className="trip-ph">
        {r.cover_id ? <img src={photoUrl(r.cover_id, "thumb")} alt="" loading="lazy" /> : <span className="noph">Photos coming soon</span>}
        <span className="trip-status"><StatusPill status={r.status} /></span>
      </span>
      <span className="trip-body">
        <b className="trip-title">{r.title}</b>
        <span className="trip-meta"><Icon name="calendar" size={16} />{fmtDate(r.check_in)} - {fmtDate(r.check_out)}</span>
        <span className="trip-meta"><Icon name="pin" size={16} />{r.city} · {r.guests} guest{r.guests > 1 ? "s" : ""}</span>
        <span className="trip-foot"><span className="trip-ref">Ref <b className="mono">{r.code}</b></span><b>{money(r.total_cents)}</b></span>
      </span>
    </Link>
  );
  return (
    <div className="wrap page-pad theme-light acct">
      <header className="acct-head">
        <div>
          <h1 className="acct-h1">My trips</h1>
          <p className="muted">{upcoming.length ? `${upcoming.length} upcoming trip${upcoming.length === 1 ? "" : "s"}` : "No upcoming trips yet"}{other.length ? ` · ${other.length} past or cancelled` : ""}</p>
        </div>
        <Link className="btn btn-ghost" href="/account">Account</Link>
      </header>
      <section aria-labelledby="up-h">
        <h2 id="up-h" className="acct-h2">Upcoming</h2>
        {upcoming.length ? <div className="trip-grid">{upcoming.map(card)}</div> : (
          <div className="acct-empty">
            <span className="acct-empty-ico"><Icon name="home" size={28} /></span>
            <div><b>No trips booked... yet!</b><p className="muted">Time to dust off your bags and find a cozy place in the 'Burgh.</p></div>
            <Link className="btn btn-primary" href="/stays">Find a stay</Link>
          </div>
        )}
      </section>
      {other.length > 0 && <section aria-labelledby="past-h"><h2 id="past-h" className="acct-h2">Past and cancelled</h2><div className="trip-grid">{other.map(card)}</div></section>}
    </div>
  );
}

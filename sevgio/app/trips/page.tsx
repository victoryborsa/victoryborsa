import Link from "next/link";
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
  const card = (r: Row) => (
    <Link key={r.id} href={`/trips/${r.code}`} className="box" style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "center", padding: 16, textDecoration: "none", color: "inherit" }}>
      <div style={{ width: 110, borderRadius: "var(--r)", overflow: "hidden", aspectRatio: "4/3", flex: "none" }}>{r.cover_id ? <img src={photoUrl(r.cover_id, "thumb")} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div className="noph" style={{ minHeight: 0 }} />}</div>
      <div className="stack" style={{ gap: 4, flex: 1, minWidth: 200 }}>
        <div className="row" style={{ gap: 8 }}><strong>{r.title}</strong><StatusPill status={r.status} /></div>
        <span className="muted">{fmtDate(r.check_in)} – {fmtDate(r.check_out)} · {r.guests} guest{r.guests > 1 ? "s" : ""} · <span className="mono">{r.code}</span></span>
        <span style={{ fontSize: 14 }}>{r.city} · {money(r.total_cents)}</span>
      </div>
      <span className="btn btn-ghost btn-sm">View</span>
    </Link>
  );
  return (
    <div className="wrap page-pad">
      <p className="eyebrow">Your account</p>
      <h1 style={{ fontSize: "clamp(26px,4vw,36px)", marginBottom: 20 }}>My trips</h1>
      <h3 style={{ marginBottom: 12 }}>Upcoming</h3>
      <div className="stack">
        {upcoming.length ? upcoming.map(card) : <div className="empty"><p>No upcoming trips yet.</p><Link className="btn btn-primary" href="/stays">Find a stay</Link></div>}
      </div>
      {other.length > 0 && <><h3 style={{ margin: "28px 0 12px" }}>Past and cancelled</h3><div className="stack">{other.map(card)}</div></>}
    </div>
  );
}

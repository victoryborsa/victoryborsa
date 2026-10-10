import { Flash } from "@/components/Flash.tsx";
import { feePayText, feeState } from "@/lib/listing-fee.ts";
import { fmtShort } from "@/lib/dates.ts";
import Link from "next/link";
import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { scopeSql } from "@/lib/access.ts";
import { money } from "@/lib/money.ts";
import { priceTag } from "@/lib/pricing.ts";
import { photoUrl } from "@/lib/queries.ts";
import { todayLocal } from "@/lib/dates.ts";
import { AutoSubmit } from "@/components/AutoSubmit.tsx";
import { groupByHost } from "@/lib/host-groups.ts";

type Row = { id: string; slug: string; title: string; city: string; status: string; booking_mode: string; nightly_price_cents: number; monthly_price_cents: number | null; min_nights: number; cover_id: string | null; photo_count: number; host_id: string; host_name: string; next_in: string | null; listing_paid_until: string | null; listing_fee_waived: boolean; host_role: string };

export default async function Listings({ searchParams }: { searchParams: Promise<{ msg?: string; host?: string }> }) {
  const sp = await searchParams;
  const u = await requireUser(["host", "admin"], "/host/listings");
  const s = scopeSql(u);
  const rows = await q<Row>(
    `SELECT p.id, p.slug, p.title, p.city, p.status, p.booking_mode, p.nightly_price_cents, p.monthly_price_cents, p.min_nights, p.host_id, h.name AS host_name,
            p.listing_paid_until::text, p.listing_fee_waived, h.role AS host_role,
            (SELECT id FROM photos ph WHERE ph.property_id = p.id ORDER BY position LIMIT 1) AS cover_id,
            (SELECT count(*) FROM photos ph WHERE ph.property_id = p.id) AS photo_count,
            (SELECT min(check_in)::text FROM bookings b WHERE b.property_id = p.id AND b.status = 'confirmed' AND b.check_in >= $${s.params.length + 1}) AS next_in
     FROM properties p JOIN users h ON h.id = p.host_id WHERE ${s.sql} ORDER BY p.title`,
    [...s.params, todayLocal()],
  );
  const fee = await feePayText();
  const due = u.role === "host" ? rows.filter(r => feeState(r, fee.enabled) === "due") : [];
  // Admins see every host's listings, so they're grouped under each host (A–Z) with a host filter.
  const grouped = u.role === "admin";
  const { groups, hosts, selected } = groupByHost(rows, grouped ? sp.host ?? "" : "");
  const statusPill = (st: string) => <span className={`pill ${st === "published" ? "ok" : st === "draft" ? "warn" : "neutral"}`}>{st === "published" ? "Live" : st === "draft" ? "Draft" : "Hidden"}</span>;
  return (
    <>
      <Flash msg={sp.msg} />
      {due.length > 0 && (
        <div className="notice warn" style={{ marginBottom: 16 }}>
          <b>Yearly listing fee: {fee.amount} per listing.</b> {due.length === 1 ? `“${due[0].title}” needs` : `${due.length} listings need`} the fee before going live. {fee.how} We'll switch {due.length === 1 ? "it" : "them"} on once it arrives.
        </div>
      )}
      <div className="row" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ flex: 1 }}>{u.role === "admin" ? "All listings on Sevgio." : "Only listings you manage are shown here."}</p>
        <Link className="btn btn-ghost" href="/host/listings/import">Import from file</Link>
        <Link className="btn btn-primary" href="/host/listings/new">Add a listing</Link>
      </div>
      {grouped && hosts.length > 0 && (
        <form className="fin-filters al-host-filter" method="get" aria-label="Filter by host" style={{ marginBottom: 16 }}>
          <AutoSubmit />
          <label className="field"><span>Host</span><select className="input" name="host" aria-label="Host" defaultValue={selected}><option value="">All hosts ({rows.length} listings)</option>{hosts.map(h => <option key={h.id} value={h.id}>{h.name} ({h.count})</option>)}</select></label>
          <noscript><button className="btn btn-ghost" type="submit">Show</button></noscript>
        </form>
      )}
      {rows.length === 0 ? <div className="empty"><p>No listings yet.</p></div> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Listing</th><th>Status</th><th>Booking</th><th className="num">Price</th><th className="num">Photos</th><th>Next arrival</th><th /></tr></thead>
            {groups.map(g => (
              <tbody key={g.hostId} className={grouped ? "host-group" : undefined}>
                {grouped && <tr className="host-head"><th colSpan={7} scope="colgroup"><span className="host-name">{g.hostName}</span> <span className="muted">· {g.rows.length} {g.rows.length === 1 ? "listing" : "listings"}</span></th></tr>}
                {g.rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                      <div style={{ width: 64, aspectRatio: "4/3", borderRadius: 6, overflow: "hidden", flex: "none" }}>{r.cover_id ? <img src={photoUrl(r.cover_id, "thumb")} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div className="noph" style={{ minHeight: 0, fontSize: 10 }}>No photo</div>}</div>
                      <div><strong>{r.title}</strong><div className="muted" style={{ fontSize: 13 }}>{r.city}{u.role === "admin" ? ` · ${r.host_name}` : ""}</div></div>
                    </div>
                  </td>
                  <td>{statusPill(r.status)}{u.role === "host" && fee.enabled && (() => { const st = feeState(r, true); return <div className="hint" style={{ marginTop: 4 }}>{st === "paid" ? `Fee paid until ${fmtShort(r.listing_paid_until!)}` : st === "waived" ? "No listing fee" : "Listing fee due"}</div>; })()}</td>
                  <td>{r.booking_mode === "instant" ? "Instant" : "Request"}</td>
                  <td className="num">{money(priceTag(r).cents)}<span className="muted"> / {priceTag(r).unit}</span></td>
                  <td className="num">{r.photo_count}</td>
                  <td>{r.next_in ? new Date(r.next_in + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : <span className="muted">None</span>}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <Link className="btn btn-ghost btn-sm" href={`/host/listings/${r.id}`}>Edit</Link>
                      <Link className="btn btn-ghost btn-sm" href={`/host/listings/${r.id}/photos`}>Photos</Link>
                      <Link className="btn btn-danger btn-sm" href={`/host/listings/${r.id}?delete=1#delete`}>Delete</Link>
                      <Link className="btn btn-ghost btn-sm" href={`/host/listings/${r.id}/calendar`}>Calendar</Link>
                      <Link className="btn btn-ghost btn-sm" href={`/stays/${r.slug}`}>View</Link>
                    </div>
                  </td>
                </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </>
  );
}

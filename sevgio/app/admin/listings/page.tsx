import { priceTag } from "@/lib/pricing.ts";
import { requireUser } from "@/lib/auth.ts";
import Link from "next/link";
import { q } from "@/lib/db.ts";
import { money } from "@/lib/money.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { Flash } from "@/components/Flash.tsx";
import { listingFeeAction, mapListingsAction, reassignListingAction, setListingStatusAction, setRatingAction } from "@/app/actions/admin.ts";
import { feeState } from "@/lib/listing-fee.ts";
import { getSettings } from "@/lib/settings.ts";
import { fmtDate } from "@/lib/dates.ts";

type Row = { id: string; slug: string; title: string; city: string; status: string; host_id: string; nightly_price_cents: number; monthly_price_cents: number | null; rating: number | null; review_count: number; photos: number; bookings: number; listing_paid_until: string | null; listing_fee_waived: boolean; host_role: string; lat: number | null; geocoded_at: string | null; address: string };

export default async function AdminListings({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requireUser(["admin"], "/admin");
  const [rows, hosts, settings] = await Promise.all([
    q<Row>(`SELECT p.id, p.slug, p.title, p.city, p.status, p.host_id, p.nightly_price_cents, p.monthly_price_cents, p.rating, p.review_count,
              p.listing_paid_until::text, p.listing_fee_waived, p.lat, p.geocoded_at, p.address, (SELECT role FROM users h WHERE h.id = p.host_id) AS host_role,
              (SELECT count(*) FROM photos ph WHERE ph.property_id = p.id) AS photos,
              (SELECT count(*) FROM bookings b WHERE b.property_id = p.id AND b.status = 'confirmed') AS bookings
            FROM properties p ORDER BY p.title`),
    q<{ id: string; name: string }>("SELECT id, name FROM users WHERE role IN ('host','admin') AND NOT disabled ORDER BY name"),
    getSettings(),
  ]);
  return (
    <>
      <Flash msg={(await searchParams).msg} />
      <div className="row" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ flex: 1 }}>Every listing on the site. Edit details, photos and calendars with the host tools.</p>
        <form action={mapListingsAction}><button className="btn btn-ghost" type="submit">📍 Find listings on the map</button></form>
        <a className="btn btn-ghost" href="/api/admin/export-listings" download>Export listings</a>
        <Link className="btn btn-ghost" href="/host/listings/import">Import from file</Link>
        <Link className="btn btn-primary" href="/host/listings/new">Add a listing</Link>
      </div>
      <div className="al-list">
        {rows.map(r => {
          const st = feeState(r, settings.listing_fee_enabled);
          const btn = (cmd: string, label: string) => <form action={listingFeeAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="cmd" value={cmd} /><button className="btn btn-ghost btn-sm" type="submit">{label}</button></form>;
          return (
            <article key={r.id} className="al-card" data-listing={r.title}>
              <div className="al-cell al-title">
                <strong>{r.title}</strong>
                <span className="hint">{r.city} · {money(priceTag(r).cents)}/{priceTag(r).unit} · {r.photos} photos · {r.bookings} bookings</span>
                <span className="hint">{r.lat !== null ? "📍 On the map (guests see the area, not the address)" : r.geocoded_at ? `⚠️ Address not found on the map${r.address ? "" : " (no address)"}: shown at its neighborhood` : "📍 Not looked up yet"}</span>
                <div className="row" style={{ gap: 6 }}>
                  <Link className="btn btn-ghost btn-sm" href={`/host/listings/${r.id}`}>Edit</Link>
                  <Link className="btn btn-ghost btn-sm" href={`/stays/${r.slug}`}>View</Link>
                  <Link className="btn btn-danger btn-sm" href={`/host/listings/${r.id}?delete=1#delete`}>Delete</Link>
                </div>
              </div>
              <div className="al-cell">
                <small>Owner (host)</small>
                <ActionForm action={reassignListingAction} className="row">
                  <input type="hidden" name="id" value={r.id} />
                  <select className="input" name="host_id" defaultValue={r.host_id} aria-label={`Host for ${r.title}`} style={{ minHeight: 34, padding: "4px 8px", maxWidth: 150 }}>{hosts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
                  <SubmitButton className="btn btn-ghost btn-sm" pendingText="…">Save</SubmitButton>
                </ActionForm>
              </div>
              <div className="al-cell">
                <small>Rating · reviews</small>
                <ActionForm action={setRatingAction} className="row">
                  <input type="hidden" name="id" value={r.id} />
                  <input className="input mono" name="rating" defaultValue={r.rating ?? ""} placeholder="4.9" inputMode="decimal" style={{ width: 58, minHeight: 34, padding: "4px 8px" }} aria-label="Rating" />
                  <input className="input mono" name="review_count" defaultValue={r.review_count} inputMode="numeric" style={{ width: 58, minHeight: 34, padding: "4px 8px" }} aria-label="Review count" />
                  <SubmitButton className="btn btn-ghost btn-sm" pendingText="…">Save</SubmitButton>
                </ActionForm>
              </div>
              {st !== "off" && (
                <div className="al-cell">
                  <small>Listing fee</small>
                  {st === "admin" ? <span className="hint">Your listing, no fee</span> : (
                    <>
                      <span className={`pill ${st === "paid" ? "ok" : st === "waived" ? "neutral" : "warn"}`} style={{ justifySelf: "start" }}>{st === "paid" ? `Paid until ${fmtDate(r.listing_paid_until!, { month: "short", day: "numeric", year: "numeric" })}` : st === "waived" ? "Waived" : "Not paid"}</span>
                      <div className="row">
                        {btn("paid", st === "paid" ? "+1 year paid" : "Mark paid (1 year)")}
                        {st === "waived" ? btn("charge", "Charge fee") : btn("waive", "Waive")}
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="al-cell">
                <small>Status</small>
                <form action={setListingStatusAction} className="row">
                  <input type="hidden" name="id" value={r.id} />
                  <span className={`pill ${r.status === "published" ? "ok" : r.status === "draft" ? "warn" : "neutral"}`}>{r.status === "published" ? "Live" : r.status === "draft" ? "Draft" : "Hidden"}</span>
                  {r.status === "published" ? <SubmitButton className="btn btn-ghost btn-sm" name="status" value="hidden" pendingText="…">Hide</SubmitButton> : r.photos > 0 ? <SubmitButton className="btn btn-ghost btn-sm" name="status" value="published" pendingText="…">Publish</SubmitButton> : <span className="hint">Needs photos</span>}
                </form>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

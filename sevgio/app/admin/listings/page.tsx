import { requireUser } from "@/lib/auth.ts";
import Link from "next/link";
import { q } from "@/lib/db.ts";
import { money } from "@/lib/money.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { Flash } from "@/components/Flash.tsx";
import { reassignListingAction, setListingStatusAction, setRatingAction } from "@/app/actions/admin.ts";

type Row = { id: string; slug: string; title: string; city: string; status: string; host_id: string; nightly_price_cents: number; rating: number | null; review_count: number; photos: number; bookings: number };

export default async function AdminListings({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requireUser(["admin"], "/admin");
  const [rows, hosts] = await Promise.all([
    q<Row>(`SELECT p.id, p.slug, p.title, p.city, p.status, p.host_id, p.nightly_price_cents, p.rating, p.review_count,
              (SELECT count(*) FROM photos ph WHERE ph.property_id = p.id) AS photos,
              (SELECT count(*) FROM bookings b WHERE b.property_id = p.id AND b.status = 'confirmed') AS bookings
            FROM properties p ORDER BY p.title`),
    q<{ id: string; name: string }>("SELECT id, name FROM users WHERE role IN ('host','admin') AND NOT disabled ORDER BY name"),
  ]);
  return (
    <>
      <Flash msg={(await searchParams).msg} />
      <div className="row" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ flex: 1 }}>Every listing on the site. Edit details, photos and calendars with the host tools.</p>
        <Link className="btn btn-ghost" href="/host/listings/import">Import from file</Link>
        <Link className="btn btn-primary" href="/host/listings/new">Add a listing</Link>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Listing</th><th>Host</th><th className="num">Price</th><th>Rating (from other sites)</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td><strong>{r.title}</strong><div className="hint">{r.city} · {r.photos} photos · {r.bookings} bookings</div></td>
                <td style={{ minWidth: 220 }}>
                  <ActionForm action={reassignListingAction} className="row">
                    <input type="hidden" name="id" value={r.id} />
                    <select name="host_id" defaultValue={r.host_id} aria-label={`Host for ${r.title}`}>{hosts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
                    <SubmitButton className="btn btn-ghost btn-sm" pendingText="…">Save</SubmitButton>
                  </ActionForm>
                </td>
                <td className="num">{money(r.nightly_price_cents)}</td>
                <td style={{ minWidth: 220 }}>
                  <ActionForm action={setRatingAction} className="row">
                    <input type="hidden" name="id" value={r.id} />
                    <input className="input mono" name="rating" defaultValue={r.rating ?? ""} placeholder="4.9" inputMode="decimal" style={{ width: 70, minHeight: 34, padding: "4px 8px" }} aria-label="Rating" />
                    <input className="input mono" name="review_count" defaultValue={r.review_count} inputMode="numeric" style={{ width: 70, minHeight: 34, padding: "4px 8px" }} aria-label="Review count" />
                    <SubmitButton className="btn btn-ghost btn-sm" pendingText="…">Save</SubmitButton>
                  </ActionForm>
                </td>
                <td>
                  <form action={setListingStatusAction} className="row" style={{ flexWrap: "nowrap" }}>
                    <input type="hidden" name="id" value={r.id} />
                    <span className={`pill ${r.status === "published" ? "ok" : r.status === "draft" ? "warn" : "neutral"}`}>{r.status === "published" ? "Live" : r.status === "draft" ? "Draft" : "Hidden"}</span>
                    {r.status === "published" ? <SubmitButton className="btn btn-ghost btn-sm" name="status" value="hidden" pendingText="…">Hide</SubmitButton> : r.photos > 0 ? <SubmitButton className="btn btn-ghost btn-sm" name="status" value="published" pendingText="…">Publish</SubmitButton> : <span className="hint">Needs photos</span>}
                  </form>
                </td>
                <td><div className="row" style={{ gap: 6, flexWrap: "nowrap" }}><Link className="btn btn-ghost btn-sm" href={`/host/listings/${r.id}`}>Edit</Link><Link className="btn btn-ghost btn-sm" href={`/stays/${r.slug}`}>View</Link><Link className="btn btn-danger btn-sm" href={`/host/listings/${r.id}?delete=1#delete`}>Delete</Link></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

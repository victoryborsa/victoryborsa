import { requireManageable } from "@/lib/access.ts";
import { ListingForm } from "@/components/ListingForm.tsx";
import { homesFor } from "@/lib/homes.ts";
import { photosFor } from "@/lib/queries.ts";
import { q } from "@/lib/db.ts";
import { deleteListingAction, updateListingAction } from "@/app/actions/host.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { listingFindings, type PolicyInput } from "@/lib/policies.ts";

export default async function EditListing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ delete?: string }> }) {
  const { id } = await params;
  const { u, p } = await requireManageable(id);
  const [homes, photos, hosts] = await Promise.all([homesFor(u, p.host_id), photosFor(p.id),
    u.role === "admin" ? q<{ id: string; name: string }>("SELECT id, name FROM users WHERE (role IN ('host','admin') AND NOT disabled) OR id = $1 ORDER BY name", [p.host_id]) : Promise.resolve(undefined)]);
  const findings = listingFindings(p as unknown as PolicyInput);
  return (
    <div style={{ maxWidth: 820 }}>
      {findings.length > 0 && (
        <div className="notice warn listing-check" data-testid="listing-check">
          <b>Listing check: {findings.length} {findings.length === 1 ? "line repeats or contradicts" : "lines repeat or contradict"} a setting</b>
          <p className="hint" style={{ margin: "4px 0 8px" }}>Guests see the setting, and these lines are hidden from them. Change the setting if it's wrong, or edit the text.</p>
          <ul>{findings.map((f, i) => <li key={i}><b>{f.field}:</b> “{f.text.length > 140 ? f.text.slice(0, 140) + "…" : f.text}” · {f.problem}</li>)}</ul>
        </div>
      )}
      <ListingForm action={updateListingAction} p={p} hosts={hosts} homes={homes} isAdmin={u.role === "admin"} submitLabel="Save listing" photos={photos.map(ph => ({ id: ph.id, caption: ph.caption }))} />
      <details className="danger-zone" id="delete" open={(await searchParams).delete === "1"}>
        <summary>Delete this listing</summary>
        <ActionForm action={deleteListingAction} confirmText={`Delete “${p.title}” for good? Its photos and calendar are deleted too. This can't be undone.`}>
          <input type="hidden" name="id" value={p.id} />
          <p className="hint">Deletes the listing, its photos, blocked dates and calendar links. Listings with reservations can't be deleted; set Status to “Hidden” instead. If this is a whole house, its rooms stay as separate listings.</p>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" name="confirm" value="yes" /> Yes, delete “{p.title}” permanently</label>
          <div><SubmitButton className="btn btn-danger" pendingText="Deleting…">Delete listing</SubmitButton></div>
        </ActionForm>
      </details>
    </div>
  );
}

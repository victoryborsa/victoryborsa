import { requireManageable } from "@/lib/access.ts";
import { ListingForm } from "@/components/ListingForm.tsx";
import { homesFor } from "@/lib/homes.ts";
import { photosFor } from "@/lib/queries.ts";
import { deleteListingAction, updateListingAction } from "@/app/actions/host.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";

export default async function EditListing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ delete?: string }> }) {
  const { id } = await params;
  const { u, p } = await requireManageable(id);
  const [homes, photos] = await Promise.all([homesFor(u, p.host_id), photosFor(p.id)]);
  return (
    <div style={{ maxWidth: 820 }}>
      <ListingForm action={updateListingAction} p={p} homes={homes} isAdmin={u.role === "admin"} submitLabel="Save listing" photos={photos.map(ph => ({ id: ph.id, caption: ph.caption }))} />
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

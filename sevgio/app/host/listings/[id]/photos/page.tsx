import { requireManageable } from "@/lib/access.ts";
import { photosFor, photoUrl } from "@/lib/queries.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { captionAction, photoCommandAction, uploadPhotosAction } from "@/app/actions/host.ts";

export default async function Photos({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { p } = await requireManageable(id);
  const photos = await photosFor(p.id);
  const created = (await searchParams).created === "1";
  return (
    <div className="stack" style={{ gap: 20 }}>
      {created && <div className="notice ok">Listing saved as a draft. Add photos, then publish it from the Details tab.</div>}
      <ActionForm action={uploadPhotosAction} className="box" resetOnOk>
        <h3>Upload photos</h3>
        <input type="hidden" name="id" value={p.id} />
        <input className="input" type="file" name="photos" accept="image/*" multiple />
        <p className="hint">JPG, PNG, WebP or HEIC, up to 20 MB each. Photos are resized automatically so pages load fast, and location data is removed. The first photo is the cover.</p>
        <div><SubmitButton pendingText="Uploading… this can take a moment">Upload</SubmitButton></div>
      </ActionForm>
      {photos.length === 0 ? <div className="empty"><p className="muted">No photos yet. Listings need at least one photo to be published.</p></div> : (
        <div className="photo-grid">
          {photos.map((ph, i) => (
            <div className="photo-tile" key={ph.id}>
              <div className="thumb"><img src={photoUrl(ph.id, "thumb")} alt={ph.caption || `Photo ${i + 1}`} loading="lazy" /></div>
              <form action={captionAction} className="tools">
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="photo" value={ph.id} />
                <input className="input" name="caption" defaultValue={ph.caption} placeholder="Caption, e.g. Main bedroom" style={{ minHeight: 34, padding: "4px 8px", fontSize: 13 }} aria-label={`Caption for photo ${i + 1}`} />
                <button className="btn btn-ghost btn-sm" type="submit">Save caption</button>
              </form>
              <form action={photoCommandAction} className="tools">
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="photo" value={ph.id} />
                {i === 0 ? <span className="pill ok">Cover</span> : <SubmitButton className="btn btn-ghost btn-sm" name="cmd" value="cover" pendingText="…">Make cover</SubmitButton>}
                <SubmitButton className="btn btn-ghost btn-sm" name="cmd" value="up" disabled={i === 0} aria-label="Move earlier" pendingText="…">←</SubmitButton>
                <SubmitButton className="btn btn-ghost btn-sm" name="cmd" value="down" disabled={i === photos.length - 1} aria-label="Move later" pendingText="…">→</SubmitButton>
                <SubmitButton className="btn btn-danger btn-sm" name="cmd" value="delete" pendingText="…">Delete</SubmitButton>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

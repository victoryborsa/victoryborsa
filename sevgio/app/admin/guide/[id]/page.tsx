import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth.ts";
import { one } from "@/lib/db.ts";
import { todayLocal } from "@/lib/dates.ts";
import { GuidePlaceForm } from "@/components/GuidePlaceForm.tsx";
import { PhotoUploader } from "@/components/PhotoUploader.tsx";
import { deletePlaceAction, discardDraftAction, placePhotoAction, setPlaceStatusAction, uploadPlacePhotoAction } from "@/app/actions/guide.ts";
import { SECTION_TITLE, allGuidePlaces, sponsorActive, withDraft } from "@/lib/guide-places.ts";

export const dynamic = "force-dynamic";

/** Edit one guide place: details, photos, publish or hide, preview, delete. */
export default async function EditPlace({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  await requireUser(["admin"], "/admin/guide");
  const { id } = await params;
  const { msg } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(await one("SELECT 1 FROM guide_places WHERE id = $1", [id]))) notFound();
  const p = (await allGuidePlaces()).find(x => x.id === id)!;
  const v = withDraft(p);
  const today = todayLocal();
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="crumbs"><Link href={`/admin/guide#place-${p.id}`}>← Pittsburgh guide</Link></div>
      {msg && <div className="notice ok" role="status">{msg}</div>}
      <div className="row" style={{ alignItems: "center", gap: 10 }}>
        <h2 style={{ flex: 1, minWidth: 220 }}>{p.name}</h2>
        {p.status === "published" ? <span className="pill ok">Published</span> : p.status === "draft" ? <span className="pill warn">Draft</span> : <span className="pill neutral">Hidden</span>}
        {sponsorActive(v, today) && <span className="pill gold">Sponsored</span>}
        <Link className="btn btn-ghost btn-sm" href={`/pittsburgh?preview=1#${v.section}`} target="_blank">Preview ↗</Link>
        <form action={setPlaceStatusAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value={p.status === "published" && !p.draft ? "hidden" : "published"} /><input type="hidden" name="back" value={`/admin/guide/${p.id}`} />
          <button className={`btn btn-sm ${p.status === "published" && !p.draft ? "btn-ghost" : "btn-primary"}`}>{p.status === "published" && !p.draft ? "Hide from guide" : p.draft ? "Publish changes" : "Publish"}</button>
        </form>
      </div>
      {p.draft && (
        <div className="notice warn row" style={{ gap: 10 }}>
          <span style={{ flex: 1, minWidth: 220 }}><b>Unpublished changes.</b> Visitors still see the published version. Check them in Preview, then publish.</span>
          <form action={discardDraftAction}><input type="hidden" name="id" value={p.id} /><button className="btn btn-ghost btn-sm">Discard changes</button></form>
        </div>
      )}
      <p className="muted">Category: {SECTION_TITLE[v.section]}. {p.status === "draft" ? "Not on the guide yet." : p.status === "hidden" ? "Hidden from visitors." : "On the guide."}</p>

      <GuidePlaceForm place={p} values={v} />

      <section id="photos" className="stack box" style={{ gap: 12 }}>
        <h3>Photos</h3>
        <p className="hint">The first photo shows on the guide card. Wide (landscape) photos look best. Photo changes apply right away.</p>
        {p.photos.length > 0 && (
          <div className="ga-photos">
            {p.photos.map((ph, i) => (
              <figure key={ph} className="ga-photo">
                <img src={`/api/site-photos/${ph}?s=thumb`} alt={`${p.name} photo ${i + 1}`} />
                <figcaption className="row" style={{ gap: 6 }}>
                  {i === 0 ? <span className="pill gold">Shown on the guide</span> : <form action={placePhotoAction}><input type="hidden" name="photo" value={ph} /><input type="hidden" name="place" value={p.id} /><input type="hidden" name="what" value="cover" /><button className="btn btn-ghost btn-sm">Show this one</button></form>}
                  <form action={placePhotoAction}><input type="hidden" name="photo" value={ph} /><input type="hidden" name="place" value={p.id} /><input type="hidden" name="what" value="remove" /><button className="linkbtn">Remove</button></form>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <PhotoUploader id={p.id} action={uploadPlacePhotoAction} compact label={p.photos.length ? "Add more photos" : "Add photos"} />
      </section>

      <section className="stack box" style={{ gap: 10 }}>
        <h3>Delete this place</h3>
        <p className="hint">Removes it and its photos for good. To take it off the guide for now, use Hide instead.</p>
        <form action={deletePlaceAction}><input type="hidden" name="id" value={p.id} /><button className="btn btn-danger btn-sm">Delete {p.name}</button></form>
      </section>
    </div>
  );
}

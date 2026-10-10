import Link from "next/link";
import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { todayLocal } from "@/lib/dates.ts";
import { PhotoUploader } from "@/components/PhotoUploader.tsx";
import { removeGuidePhotoAction, uploadGuidePhotoAction } from "@/app/actions/admin.ts";
import { movePlaceAction, setPlaceStatusAction } from "@/app/actions/guide.ts";
import { FIRST_SHOWN, SECTION_IDS, SECTION_TITLE, SECTION_TONE, allGuidePlaces, sponsorActive, type GuidePlace } from "@/lib/guide-places.ts";

export const dynamic = "force-dynamic";

function sponsorPill(p: GuidePlace, today: string) {
  if (!p.sponsored) return null;
  if (sponsorActive(p, today)) return <span className="pill gold">Sponsored{p.sponsor_end ? ` until ${p.sponsor_end}` : ""}</span>;
  if (p.sponsor_start && p.sponsor_start > today) return <span className="pill neutral">Sponsored from {p.sponsor_start}</span>;
  return <span className="pill neutral">Sponsorship ended {p.sponsor_end}</span>;
}

/** Admin → Pittsburgh guide: every place by category. Add, edit, reorder, publish or hide, sponsor; preview before publishing. */
export default async function GuideAdmin({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requireUser(["admin"], "/admin/guide");
  const { msg } = await searchParams;
  const today = todayLocal();
  const [places, banner] = await Promise.all([allGuidePlaces(), q<{ id: string }>("SELECT id FROM site_photos WHERE slot = 'guide-banner' LIMIT 1")]);
  const live = places.filter(p => p.status === "published").length;
  return (
    <div className="stack" style={{ gap: 22 }}>
      {msg && <div className="notice ok" role="status">{msg}</div>}
      <div className="row" style={{ alignItems: "flex-end", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h2>Pittsburgh guide</h2>
          <p className="muted">{places.length} places, {live} on the guide. The first {FIRST_SHOWN} published places in each category show before “See more”: use ↑ ↓ to choose them. Drafts and hidden places are only visible in Preview.</p>
        </div>
        <Link className="btn btn-ghost" href="/pittsburgh?preview=1" target="_blank">Preview the guide ↗</Link>
        <Link className="btn btn-primary" href="/admin/guide/new">Add a place</Link>
      </div>

      {SECTION_IDS.map(sec => {
        const list = places.filter(p => p.section === sec);
        const firstIds = new Set(list.filter(p => p.status === "published").slice(0, FIRST_SHOWN).map(p => p.id));
        return (
          <section key={sec} className="stack" style={{ gap: 10 }} aria-label={SECTION_TITLE[sec]}>
            <h3>{SECTION_TITLE[sec]} <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>{list.length} place{list.length === 1 ? "" : "s"}</span></h3>
            {list.length === 0 ? <p className="muted">No places yet. <Link href={`/admin/guide/new?section=${sec}`}>Add one</Link>.</p> : (
              <ol className="ga-list">
                {list.map((p, i) => (
                  <li key={p.id} id={`place-${p.id}`} className={`ga-row${p.status !== "published" ? " off" : ""}`}>
                    <span className="ga-num" aria-label={`Position ${i + 1}`}>{i + 1}</span>
                    <span className="ga-pic" style={{ "--tone": SECTION_TONE[sec] } as React.CSSProperties}>
                      {p.photos[0] ? <img src={`/api/site-photos/${p.photos[0]}?s=thumb`} alt="" /> : <span aria-hidden>{p.icon}</span>}
                    </span>
                    <span className="ga-main">
                      <Link href={`/admin/guide/${p.id}`} className="ga-name">{p.name}</Link>
                      <span className="ga-tags">
                        {p.status === "published" ? <span className="pill ok">Published</span> : p.status === "draft" ? <span className="pill warn">Draft</span> : <span className="pill neutral">Hidden</span>}
                        {firstIds.has(p.id) && <span className="pill neutral">Shown first</span>}
                        {p.draft && <span className="pill warn">Unpublished changes</span>}
                        {sponsorPill(p, today)}
                        <span className="hint">{p.area}{p.photos.length ? ` · ${p.photos.length} photo${p.photos.length === 1 ? "" : "s"}` : " · no photo"}</span>
                      </span>
                    </span>
                    <span className="ga-actions">
                      <form action={movePlaceAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="dir" value="top" /><button className="btn btn-ghost btn-sm" disabled={i === 0} aria-label={`Move ${p.name} to the top`}>Top</button></form>
                      <form action={movePlaceAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="dir" value="up" /><button className="btn btn-ghost btn-sm" disabled={i === 0} aria-label={`Move ${p.name} up`}>↑</button></form>
                      <form action={movePlaceAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="dir" value="down" /><button className="btn btn-ghost btn-sm" disabled={i === list.length - 1} aria-label={`Move ${p.name} down`}>↓</button></form>
                      <Link className="btn btn-ghost btn-sm" href={`/admin/guide/${p.id}`}>Edit</Link>
                      <form action={setPlaceStatusAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value={p.status === "published" ? "hidden" : "published"} /><input type="hidden" name="back" value={`/admin/guide#place-${p.id}`} />
                        <button className={`btn btn-sm ${p.status === "published" ? "btn-ghost" : "btn-primary"}`} aria-label={`${p.status === "published" ? "Hide" : "Publish"} ${p.name}`}>{p.status === "published" ? "Hide" : "Publish"}</button>
                      </form>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}

      <section className="stack box" style={{ gap: 10 }}>
        <h3>Page banner photo</h3>
        <p className="hint">Shown with the Pittsburgh pictures at the bottom of the guide. A wide skyline photo works best.</p>
        <div className="row" style={{ gap: 14 }}>
          {banner[0] && <img src={`/api/site-photos/${banner[0].id}?s=thumb`} alt="" style={{ width: 160, borderRadius: 10 }} />}
          <PhotoUploader id="guide-banner" action={uploadGuidePhotoAction} compact label={banner[0] ? "Replace photo" : "Add photo"} />
          {banner[0] && <form action={removeGuidePhotoAction}><input type="hidden" name="slot" value="guide-banner" /><button className="linkbtn" type="submit">Remove photo</button></form>}
        </div>
      </section>
    </div>
  );
}

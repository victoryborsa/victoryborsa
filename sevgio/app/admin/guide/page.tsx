import Link from "next/link";
import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { SECTIONS, slugOf } from "@/lib/guide.ts";
import { PhotoUploader } from "@/components/PhotoUploader.tsx";
import { removeGuidePhotoAction, uploadGuidePhotoAction } from "@/app/actions/admin.ts";

const TITLES: Record<string, string> = { see: "Must-see & historic", museums: "Museums & gardens", eat: "What to eat", drink: "Bars & breweries", do: "Things to do" };

/** Upload a real photo for each place in the Pittsburgh guide. Places without one show their picture icon. */
export default async function GuidePhotos() {
  await requireUser(["admin"], "/admin/guide");
  const rows = await q<{ id: string; slot: string }>("SELECT id, slot FROM site_photos WHERE slot IS NOT NULL");
  const photos = new Map(rows.map(r => [r.slot, r.id]));
  const total = SECTIONS.reduce((n, s) => n + s.places.length, 0);
  return (
    <div className="stack" style={{ gap: 22 }}>
      <div>
        <h2>Pittsburgh guide photos</h2>
        <p className="muted">{photos.size} of {total} places have a photo. Add one for each place and it replaces the picture icon on the <Link href="/pittsburgh">Pittsburgh guide</Link>. Wide (landscape) photos look best. Use photos you took, or free ones from unsplash.com or pexels.com.</p>
      </div>
      {SECTIONS.map(sec => (
        <section key={sec.id} className="stack" style={{ gap: 12 }}>
          <h3>{TITLES[sec.id]}</h3>
          <div className="guide-admin">
            {sec.places.map(p => {
              const slug = slugOf(p.name), photo = photos.get(slug);
              return (
                <div key={slug} className="guide-admin-row">
                  <div className="guide-pic small" style={{ "--tone": sec.tone } as React.CSSProperties}>
                    {photo ? <img src={`/api/site-photos/${photo}?s=thumb`} alt="" /> : <span className="guide-icon" aria-hidden>{p.icon}</span>}
                  </div>
                  <div className="stack" style={{ gap: 6, flex: 1, minWidth: 220 }}>
                    <b>{p.name}</b>
                    <PhotoUploader id={slug} action={uploadGuidePhotoAction} compact label={photo ? "Replace photo" : "Add photo"} />
                    {photo && <form action={removeGuidePhotoAction}><input type="hidden" name="slot" value={slug} /><button className="linkbtn" type="submit">Remove photo</button></form>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

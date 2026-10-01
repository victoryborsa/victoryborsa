import { one } from "@/lib/db.ts";
import { SkylineArt } from "./PittsburghArt.tsx";

/** A faded Pittsburgh picture behind the whole page, darkened so text stays readable. Uses the first slideshow photo. */
export async function PhotoBackdrop() {
  const photo = await one<{ id: string }>("SELECT id FROM site_photos WHERE slot IS NULL OR slot = 'guide-banner' ORDER BY (slot IS NULL) DESC, position, created_at LIMIT 1");
  return (
    <div className="page-backdrop" aria-hidden="true">
      {photo ? <img src={`/api/site-photos/${photo.id}`} alt="" /> : <SkylineArt />}
    </div>
  );
}

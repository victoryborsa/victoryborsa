import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage.tsx";
import { Thumb } from "@/components/Thumb.tsx";
import { THUMB_CREDITS, THUMB_LICENSE, type ThumbName } from "@/lib/thumbs.ts";
import { pageMeta } from "@/lib/seo.tsx";

export const metadata: Metadata = pageMeta("/photo-credits", "Photo credits", "Credits and licenses for the small category, amenity and service photos used on sevgio.com.");

const label = (slug: string) => slug.replace(/-/g, " ").replace(/^./, c => c.toUpperCase());

export default function PhotoCredits() {
  const list = Object.entries(THUMB_CREDITS) as [ThumbName, (typeof THUMB_CREDITS)[ThumbName]][];
  return (
    <LegalPage title="Photo credits" updated="October 8, 2026" intro="The small photos next to categories, amenities, services and guest types are shared by their photographers on Flickr under a Creative Commons license. We cropped and resized them. Photos of our homes belong to Sevgio.">
      <section>
        <h2>Licensed photos</h2>
        <p>Each photo below is used under the <a href={THUMB_LICENSE.url} target="_blank" rel="noopener noreferrer license">Creative Commons Attribution 2.0 license ({THUMB_LICENSE.name})</a>. The photographers don&apos;t endorse Sevgio.</p>
        <ul className="credits">
          {list.map(([slug, c]) => (
            <li key={slug}>
              <Thumb name={slug} size={48} />
              <span><b>{label(slug)}</b><span className="hint">“{c.title}” by {c.author} · <a href={c.url} target="_blank" rel="noopener noreferrer">Original on Flickr</a> · {THUMB_LICENSE.name}</span></span>
            </li>
          ))}
        </ul>
      </section>
    </LegalPage>
  );
}

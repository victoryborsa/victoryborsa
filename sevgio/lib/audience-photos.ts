import "server-only";
import { q } from "./db.ts";
import { AUDIENCES, audienceSlot } from "./audiences.ts";

export type AudiencePhoto = {
  src: string; srcSet: string; width: number; height: number; alt: string;
  /** A stock photo: the panel says it's illustrative, so nobody takes the home in it for a Sevgio listing. */
  stock: boolean;
};

/** One photo per group: the photo an admin uploaded for it in Admin → Settings, otherwise the licensed photo that ships with the site. */
export async function audiencePhotos(): Promise<Record<string, AudiencePhoto>> {
  const uploaded = await q<{ id: string; slot: string; caption: string; width: number; height: number }>(
    "SELECT id, slot, caption, width, height FROM site_photos WHERE slot LIKE 'audience:%'");
  return Object.fromEntries(AUDIENCES.map(a => {
    const up = uploaded.find(u => u.slot === audienceSlot(a.slug));
    if (up) {
      const src = `/api/site-photos/${up.id}`;
      return [a.slug, { src, srcSet: `${src}?s=thumb 720w, ${src} ${up.width}w`, width: up.width, height: up.height, alt: up.caption || a.photo.alt, stock: false }];
    }
    const file = (w: number) => `/img/audiences/${a.slug}-${w}.webp`;
    return [a.slug, { src: file(960), srcSet: [640, 960, 1280].map(w => `${file(w)} ${w}w`).join(", "), width: 1280, height: 960, alt: a.photo.alt, stock: true }];
  }));
}

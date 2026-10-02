import { ART } from "./PittsburghArt.tsx";

/** Three Pittsburgh pictures side by side: uploaded photos first, then the drawn scenes (skyline, Incline, Cathedral). Home page and guide. */
export function PictureTrio({ photos }: { photos: { id: string; caption: string }[] }) {
  const trio = [0, 1, 2].map(i =>
    photos[i]
      ? { src: `/api/site-photos/${photos[i].id}`, caption: photos[i].caption, Art: null }
      : { src: "", caption: ART[i - photos.length]?.caption ?? "", Art: ART[i - photos.length]?.Art ?? null },
  );
  return (
    <div className="guide-trio">
      {trio.map(({ src, caption, Art }, i) => (
        <figure key={i} className="guide-trio-pic">
          {src ? <img src={src} alt={caption || "Pittsburgh"} /> : Art ? <Art /> : null}
          {caption && <figcaption>{caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

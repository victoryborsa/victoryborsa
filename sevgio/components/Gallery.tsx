"use client";
import { useCallback, useEffect, useState } from "react";

type Ph = { id: string; caption: string };
const src = (id: string, s: "thumb" | "medium" | "large") => `/api/photos/${id}?s=${s}`;

export function Gallery({ photos, title }: { photos: Ph[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  useEffect(() => {
    if (open === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setOpen(i => (i! + 1) % photos.length);
      if (e.key === "ArrowLeft") setOpen(i => (i! + photos.length - 1) % photos.length);
    };
    document.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = ""; };
  }, [open, photos.length, close]);

  if (!photos.length) return <div className="gallery"><div className="g0" style={{ borderRadius: "var(--r)", overflow: "hidden" }}><div className="noph">Photos coming soon</div></div></div>;
  const shown = photos.slice(0, 5);
  return (
    <>
      <div className="gallery" style={photos.length < 3 ? { gridTemplateColumns: "1fr", height: "auto" } : undefined}>
        {shown.map((ph, i) => (
          <button key={ph.id} type="button" className={`g${i} ${i >= 3 ? "gx" : ""}`} onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} of ${photos.length}${ph.caption ? ": " + ph.caption : ""}`}>
            {i === 0
              ? <img src={src(ph.id, "large")} srcSet={`${src(ph.id, "medium")} 1000w, ${src(ph.id, "large")} 1800w`} sizes="(min-width: 760px) 560px, 100vw" alt={ph.caption || `${title}, photo 1`} fetchPriority="high" />
              : <img src={src(ph.id, "thumb")} alt={ph.caption || `${title}, photo ${i + 1}`} loading="lazy" decoding="async" />}
            {i === 0 && photos.length > 1 && <span className="more">View all {photos.length} photos</span>}
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Photos of ${title}`} onClick={e => { if (e.target === e.currentTarget) close(); }}>
          <div className="bar">
            <strong style={{ flex: 1 }}>{photos[open].caption || title} · {open + 1} / {photos.length}</strong>
            <button className="btn btn-ghost btn-sm" type="button" onClick={close} autoFocus>Close</button>
          </div>
          <div className="stage" onClick={e => { if (e.target === e.currentTarget) close(); }}><img src={src(photos[open].id, "large")} alt={photos[open].caption || `${title}, photo ${open + 1}`} /></div>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn btn-ghost" type="button" onClick={() => setOpen((open + photos.length - 1) % photos.length)}>‹ Previous</button>
            <button className="btn btn-ghost" type="button" onClick={() => setOpen((open + 1) % photos.length)}>Next ›</button>
          </div>
        </div>
      )}
    </>
  );
}

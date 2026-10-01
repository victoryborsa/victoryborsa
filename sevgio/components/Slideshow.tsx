"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ART } from "./PittsburghArt.tsx";

type Slide = { src: string; caption: string };

/** Pittsburgh slideshow (home page and guide): uploaded photos, or drawn scenes until there are some. Children are laid over the pictures. */
export function Slideshow({ photos, className, children }: { photos: Slide[]; className?: string; children?: ReactNode }) {
  const count = photos.length || ART.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI(n => (n + 1) % count), 5000);
    return () => clearInterval(t);
  }, [paused, count]);
  const go = (n: number) => setI((n + count) % count);
  const caption = photos.length ? photos[i]?.caption : ART[i].caption;
  return (
    <div className={`slides${className ? " " + className : ""}`} role="region" aria-roledescription="carousel" aria-label="Pittsburgh" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {Array.from({ length: count }, (_, n) => {
        const Art = ART[n]?.Art;
        return (
          <div key={n} className={`slide${n === i ? " on" : ""}`} aria-hidden={n !== i} role="group" aria-roledescription="slide" aria-label={`${n + 1} of ${count}`}>
            {photos.length ? <img src={photos[n].src} alt={photos[n].caption || "Pittsburgh"} loading={n === 0 ? "eager" : "lazy"} /> : <Art />}
          </div>
        );
      })}
      {children && <div className="slides-over">{children}</div>}
      {caption && <p className="slide-cap">{caption}</p>}
      {count > 1 && (
        <>
          <button type="button" className="slide-nav prev" onClick={() => go(i - 1)} aria-label="Previous picture">‹</button>
          <button type="button" className="slide-nav next" onClick={() => go(i + 1)} aria-label="Next picture">›</button>
          <div className="slide-dots">
            {Array.from({ length: count }, (_, n) => <button key={n} type="button" className={n === i ? "on" : ""} onClick={() => go(n)} aria-label={`Show picture ${n + 1}`} aria-current={n === i} />)}
          </div>
        </>
      )}
    </div>
  );
}

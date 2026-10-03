"use client";
import { useEffect, useState } from "react";
import { ART } from "./PittsburghArt.tsx";

type Pic = { src: string; caption: string; Art: (() => React.JSX.Element) | null };

/**
 * Three Pittsburgh picture squares side by side (home page and guide). Each square is its own small slideshow:
 * every 3 seconds it fades to the next uploaded photo, the squares a second apart, never showing the same photo
 * at once. With fewer than three photos, the drawn scenes (skyline, Incline, Cathedral) fill in.
 */
export function PictureTrio({ photos }: { photos: { id: string; caption: string }[] }) {
  const pool: Pic[] = photos.map(p => ({ src: `/api/site-photos/${p.id}`, caption: p.caption, Art: null }));
  for (let i = 0; pool.length < 3 && i < ART.length; i++) pool.push({ src: "", caption: ART[i].caption, Art: ART[i].Art });
  return (
    <div className="guide-trio">
      {[0, 1, 2].map(i => <Square key={i} pool={pool} start={i} delay={i * 1000} />)}
    </div>
  );
}

function Square({ pool, start, delay }: { pool: Pic[]; start: number; delay: number }) {
  const [step, setStep] = useState(0);
  const n = pool.length;
  const moving = n > 3;
  useEffect(() => {
    if (!moving || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    // With only a few photos the squares change together, so two of them never show the same one.
    const wait = setTimeout(() => { timer = setInterval(() => setStep(s => s + 1), 3000); }, n > 5 ? delay : 0);
    return () => { clearTimeout(wait); clearInterval(timer); };
  }, [moving, delay, n]);
  // Square k shows photos k, k+3, k+6… (wrapping around), so the three squares always differ.
  const at = (s: number) => (((start + 3 * s) % n) + n) % n;
  const cur = moving ? at(step) : start;
  const keep = moving ? new Set([at(step - 1), cur, at(step + 1)]) : new Set([cur]);
  return (
    <figure className="guide-trio-pic">
      {[...keep].map(k => {
        const p = pool[k];
        if (!p) return null;
        return (
          <div key={k} className={`gt-slide${k === cur ? " on" : ""}`} aria-hidden={k !== cur}>
            {p.src ? <img src={p.src} alt={k === cur ? p.caption || "Pittsburgh" : ""} decoding="async" /> : p.Art ? <p.Art /> : null}
          </div>
        );
      })}
      {pool[cur]?.caption && <figcaption>{pool[cur].caption}</figcaption>}
    </figure>
  );
}

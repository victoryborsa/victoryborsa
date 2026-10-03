"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { statsPost } from "./ListingStats.tsx";

/** A titled row of cards that scrolls sideways, with ‹ › buttons on computers (swipe on phones). */
export function CardRow({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = () => {
    const t = track.current;
    if (t) setEdge({ start: t.scrollLeft < 4, end: t.scrollLeft + t.clientWidth >= t.scrollWidth - 4 });
  };
  useEffect(() => { update(); window.addEventListener("resize", update); return () => window.removeEventListener("resize", update); }, []);
  const go = (dir: number) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.9, behavior: "smooth" });
  return (
    <section className="ab-row" aria-label={title}>
      <div className="ab-row-head">
        <h2><Link href={href}>{title}<span aria-hidden className="ab-row-arrow">›</span></Link></h2>
        <span className="ab-row-nav">
          <button type="button" aria-label={`Scroll ${title} back`} disabled={edge.start} onClick={() => go(-1)}>‹</button>
          <button type="button" aria-label={`Scroll ${title} forward`} disabled={edge.end} onClick={() => go(1)}>›</button>
        </span>
      </div>
      <div className="ab-track" ref={track} onScroll={update}>{children}</div>
    </section>
  );
}

/** The heart on a card: saves the stay as a favourite (counted on the listing's "saved as favourite" number). */
export function FavHeart({ id, saved }: { id: string; saved: boolean }) {
  const [on, setOn] = useState(saved);
  return (
    <button type="button" className={`ab-heart${on ? " on" : ""}`} aria-pressed={on} aria-label={on ? "Saved to favourites" : "Save to favourites"}
      onClick={e => { e.preventDefault(); e.stopPropagation(); const next = !on; setOn(next); statsPost(id, { kind: "favorite", on: next }).then(r => r && setOn(r.mine.favorite)); }}>
      <svg viewBox="0 0 32 32" aria-hidden><path d="M16 28c7-4.7 14-10 14-17a7 7 0 0 0-14-3.3A7 7 0 0 0 2 11c0 7 7 12.3 14 17z" /></svg>
    </button>
  );
}

type Recent = { value: string; label: string; ci?: string; co?: string; guests?: number };
const show = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Continue your search": the last place this visitor searched, one tap away. */
export function ContinueSearch({ img }: { img: string | null }) {
  const [r, setR] = useState<Recent | null>(null);
  useEffect(() => { try { setR((JSON.parse(localStorage.getItem("sevgio.recentSearches") || "[]") as Recent[])[0] || null); } catch { /* private window */ } }, []);
  if (!r?.value) return null;
  const qs = new URLSearchParams({ loc: r.value, ...(r.ci && r.co ? { ci: r.ci, co: r.co } : {}), ...(r.guests ? { guests: String(r.guests) } : {}) });
  return (
    <div className="ab-continue">
      <Link href={`/stays?${qs}`}>
        {img ? <img src={img} alt="" width={44} height={44} /> : <span className="ab-continue-ico" aria-hidden>🔎</span>}
        <b>Continue your search</b>
        <span className="muted">{r.label}{r.ci && r.co ? ` · ${show(r.ci)} - ${show(r.co)}` : ""}</span>
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

"use client";
import Link from "next/link";
import { Children, useEffect, useRef, useState } from "react";
import { statsPost } from "./ListingStats.tsx";

/**
 * A titled row of cards. Normally it scrolls sideways, with ‹ › buttons on computers (swipe on phones).
 * With `limit`, it's a grid that shows that many cards first, with See more / Show less beside the title.
 */
export function CardRow({ title, sub, href, limit, children }: { title: string; sub?: string; href: string; limit?: number; children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const [more, setMore] = useState(false);
  const total = Children.count(children);
  const update = () => {
    const t = track.current;
    if (t) setEdge({ start: t.scrollLeft < 4, end: t.scrollLeft + t.clientWidth >= t.scrollWidth - 4 });
  };
  useEffect(() => { if (limit) return; update(); window.addEventListener("resize", update); return () => window.removeEventListener("resize", update); }, [limit]);
  const go = (dir: number) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.9, behavior: "smooth" });
  const less = () => {
    setMore(false);
    // Back to the row's title if it has scrolled out of view.
    const top = box.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) box.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  const hidden = limit ? Math.max(0, total - limit) : 0;
  return (
    <section ref={box} className={`ab-row${limit ? " ab-row-grid" : ""}${limit && !more ? " collapsed" : ""}`} aria-label={title}>
      <div className="ab-row-head">
        <div>
          <h2><Link href={href}>{title}<span aria-hidden className="ab-row-arrow">›</span></Link></h2>
          {sub && <p className="ab-row-sub">{sub}</p>}
        </div>
        {limit ? (
          hidden > 0 && (
            <button type="button" className="ab-more" aria-expanded={more} onClick={() => (more ? less() : setMore(true))}>
              {more ? "Show less" : `See more (${hidden})`}
            </button>
          )
        ) : (
          <span className="ab-row-nav">
            <button type="button" aria-label={`Scroll ${title} back`} disabled={edge.start} onClick={() => go(-1)}>‹</button>
            <button type="button" aria-label={`Scroll ${title} forward`} disabled={edge.end} onClick={() => go(1)}>›</button>
          </span>
        )}
      </div>
      <div className={limit ? "ab-grid" : "ab-track"} ref={track} onScroll={limit ? undefined : update}>{children}</div>
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

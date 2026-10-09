"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon.tsx";
import { AUDIENCES, AUDIENCE_NOTE, audienceBySlug } from "@/lib/audiences.ts";
import type { AudiencePhoto } from "@/lib/audience-photos.ts";

/** Fills "I am a" in the request form and takes the visitor there. */
export function fillWho(who: string) {
  const sel = document.querySelector<HTMLSelectElement>("#request select[name=who]");
  if (sel) sel.value = who;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("request")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  document.querySelector<HTMLInputElement>("#request input[name=name]")?.focus({ preventScroll: true });
}

/** The "Who we host" buttons. Each opens its panel right below the row (one at a time); every panel's text is in the page's HTML,
 *  so search engines read all five. `?for=<group>` or `#<group>` opens one when the page loads, and works without JavaScript. */
export function AudiencePanels({ photos, initial }: { photos: Record<string, AudiencePhoto>; initial?: string }) {
  const [open, setOpen] = useState<string | null>(audienceBySlug(initial)?.slug ?? null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const fromHash = () => { const a = audienceBySlug(location.hash.slice(1)); if (a) setOpen(a.slug); };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  function choose(slug: string) {
    const next = open === slug ? null : slug;
    setOpen(next);
    const url = new URL(location.href);
    url.searchParams.delete("for");
    url.hash = next ?? "";
    history.replaceState(history.state, "", url.pathname + url.search + (next ? url.hash : ""));
  }

  // Left/Right (and Home/End) move between the buttons, as in a tab row; Tab still moves on into the open panel.
  function onKey(e: React.KeyboardEvent, i: number) {
    const n = AUDIENCES.length;
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % n : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    tabs.current[to]?.focus();
  }

  // Start loading a panel's photo as soon as the pointer or keyboard reaches its button.
  const warm = (slug: string) => { const p = photos[slug]; if (p) { const img = new Image(); img.sizes = SIZES; img.srcset = p.srcSet; img.src = p.src; } };

  return (
    <>
      <ul className="ch-who-row" aria-label="Choose who the housing is for">
        {AUDIENCES.map((a, i) => (
          <li key={a.slug}>
            <button
              ref={el => { tabs.current[i] = el; }}
              type="button" id={`who-${a.slug}`} className="ch-who-btn"
              aria-expanded={open === a.slug} aria-controls={`panel-${a.slug}`}
              onClick={() => choose(a.slug)} onKeyDown={e => onKey(e, i)}
              onPointerEnter={() => warm(a.slug)} onFocus={() => warm(a.slug)}
            >
              <Icon name={a.icon} size={20} />{a.label}
            </button>
          </li>
        ))}
      </ul>
      {AUDIENCES.map(a => {
        const p = photos[a.slug];
        return (
          <section key={a.slug} id={`panel-${a.slug}`} className="ch-panel" role="region" aria-labelledby={`panel-${a.slug}-h`} hidden={open !== a.slug}>
            <figure className="ch-panel-ph">
              <img src={p.src} srcSet={p.srcSet} sizes={SIZES} width={p.width} height={p.height} alt={p.alt} loading="lazy" decoding="async" />
              {p.stock && <figcaption>Illustrative photo, not a Sevgio listing.</figcaption>}
            </figure>
            <div className="ch-panel-text">
              <h3 id={`panel-${a.slug}-h`}>{a.heading}</h3>
              <p className="ch-panel-sub">{a.subtitle}</p>
              {a.body.map((t, i) => <p key={i}>{t}</p>)}
              <p className="ch-panel-note">{AUDIENCE_NOTE}</p>
              <a className="btn btn-primary ch-panel-cta" href={`/corporate-housing?for=${a.slug}#request`} data-who={a.who}
                onClick={e => { e.preventDefault(); fillWho(a.who); }}>
                {a.button}
              </a>
            </div>
          </section>
        );
      })}
    </>
  );
}

const SIZES = "(min-width: 901px) 560px, calc(100vw - 32px)";

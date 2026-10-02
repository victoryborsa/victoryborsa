"use client";
import { useEffect } from "react";

/**
 * Controls for the guide's collapsible sections: the category buttons open their section and jump to it,
 * "Open all" / "Close all", and a link like /pittsburgh#eat opens that section on arrival.
 */
export function GuideAccordion({ items, openAll, closeAll }: { items: { id: string; label: string; icon: string }[]; openAll: string; closeAll: string }) {
  const sections = () => Array.from(document.querySelectorAll<HTMLDetailsElement>("details.gsec"));
  const show = (id: string, scroll = true) => {
    const d = document.getElementById(id);
    if (!(d instanceof HTMLDetailsElement)) return;
    d.open = true;
    if (scroll) requestAnimationFrame(() => d.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  useEffect(() => {
    const fromHash = () => { const id = decodeURIComponent(location.hash.slice(1)); if (id) show(id); };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  return (
    <div className="gsec-controls">
      <nav className="guide-toc" aria-label="Guide sections">
        {items.map(it => (
          <a key={it.id} href={`#${it.id}`} onClick={e => { e.preventDefault(); history.replaceState(null, "", `#${it.id}`); show(it.id); }}>
            <span aria-hidden>{it.icon}</span> {it.label}
          </a>
        ))}
      </nav>
      <div className="gsec-all">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => sections().forEach(d => (d.open = true))}>{openAll}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => sections().forEach(d => (d.open = false))}>{closeAll}</button>
      </div>
    </div>
  );
}

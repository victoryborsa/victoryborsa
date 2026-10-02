"use client";
import { useEffect, useState } from "react";

const sections = () => Array.from(document.querySelectorAll<HTMLDetailsElement>("details.guide-cat"));

/** Category chips for the Pittsburgh guide. A chip opens its category and jumps to it; lit chips show which categories are open. */
export function GuideNav({ items, openAll, closeAll }: { items: { id: string; icon: string; label: string }[]; openAll: string; closeAll: string }) {
  const [open, setOpen] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setOpen(sections().filter(d => d.open).map(d => d.id));
    // A link like /pittsburgh#eat opens that category.
    const fromHash = () => {
      const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (el instanceof HTMLDetailsElement && el.classList.contains("guide-cat")) el.open = true;
    };
    fromHash();
    sync();
    // "toggle" doesn't bubble, so listen in the capture phase.
    document.addEventListener("toggle", sync, true);
    window.addEventListener("hashchange", fromHash);
    return () => { document.removeEventListener("toggle", sync, true); window.removeEventListener("hashchange", fromHash); };
  }, []);

  const setAll = (value: boolean) => sections().forEach(d => { d.open = value; });
  const allOpen = open.length === items.length;

  return (
    <nav className="guide-toc" aria-label="Guide sections">
      {items.map(it => (
        <a key={it.id} href={`#${it.id}`} className={open.includes(it.id) ? "on" : undefined} aria-current={open.includes(it.id) || undefined}
          onClick={() => { const d = document.getElementById(it.id); if (d instanceof HTMLDetailsElement) d.open = true; }}>
          <span aria-hidden="true">{it.icon}</span> {it.label}
        </a>
      ))}
      <button type="button" className="guide-toggle-all" onClick={() => setAll(!allOpen)}>{allOpen ? closeAll : openAll}</button>
    </nav>
  );
}

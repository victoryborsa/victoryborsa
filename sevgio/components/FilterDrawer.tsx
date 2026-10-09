"use client";
import { useEffect, useState } from "react";

/** "Filters" button that opens all the filters in a panel (a sheet from the bottom on phones). */
export function FilterDrawer({ active, children }: { active: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [open]);
  return (
    <>
      <button type="button" className={`chip chip-filters${active ? " on" : ""}`} aria-expanded={open} onClick={() => setOpen(true)}>
        <img src="/icons/filters/filters.svg" width={20} height={20} alt="" className="chip-img" />
        Filters{active ? ` (${active})` : ""}
      </button>
      {open && (
        <div className="drawer-back" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="drawer" role="dialog" aria-modal="true" aria-label="Filters">
            <div className="drawer-head"><h3>Filters</h3><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close filters">✕</button></div>
            {children}
          </div>
        </div>
      )}
    </>
  );
}

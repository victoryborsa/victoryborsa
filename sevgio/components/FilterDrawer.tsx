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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
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

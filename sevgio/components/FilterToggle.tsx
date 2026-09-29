"use client";
import { useState } from "react";

/** On phones the filters start hidden behind a button, so results come first. On desktop they're always shown. */
export function FilterToggle({ active, children }: { active: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`filters-wrap${open ? " open" : ""}`}>
      <button type="button" className="btn btn-ghost filters-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide filters" : `Filters${active ? ` (${active})` : ""}`}
      </button>
      {children}
    </div>
  );
}

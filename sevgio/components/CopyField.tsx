"use client";
import { useState } from "react";

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="row" style={{ flexWrap: "nowrap" }}>
      <input className="input mono" readOnly value={value} aria-label={label} onFocus={e => e.currentTarget.select()} style={{ fontSize: 13 }} />
      <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* select-and-copy fallback */ } }}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

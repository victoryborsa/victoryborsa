"use client";
import { useState } from "react";

/** A small "Copy" button for a booking reference or other short text. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="btn btn-ghost btn-sm" aria-label={`${label} ${value}`}
      onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked: the text can still be selected */ } }}>
      {copied ? "Copied" : label}
    </button>
  );
}

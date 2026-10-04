"use client";
import { useEffect, useRef, useState } from "react";
import { Calendar } from "./Calendar.tsx";
import { Icon } from "./Icon.tsx";

const show = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * One optional date with the site's own calendar, so it opens the same way on phones and computers:
 * tap the field or the calendar icon, move between months, pick a day. "Clear" empties it.
 */
export function DateField({ name, label, initial, today, emptyText, hint }: { name: string; label: string; initial: string; today: string; emptyText: string; hint?: string }) {
  const [value, setValue] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initial) ? initial : "");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = `df-${name}`;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  return (
    <div className="field df" ref={box}>
      <span id={`${id}-l`}>{label}</span>
      <input type="hidden" name={name} value={value} />
      <div className="df-box">
        <button type="button" className={`input df-btn${open ? " on" : ""}`} aria-labelledby={`${id}-l ${id}-v`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
          <span id={`${id}-v`} className={value ? "" : "df-ph"}>{value ? show(value) : emptyText}</span>
          <Icon name="calendar" size={18} />
        </button>
        {value && <button type="button" className="df-clear" aria-label={`Clear ${label}`} onClick={() => { setValue(""); setOpen(false); }}>×</button>}
      </div>
      {hint && <span className="hint">{hint}</span>}
      {open && (
        <div className="dr-pop df-pop" role="dialog" aria-label={`Choose ${label.toLowerCase()}`}>
          <p className="dr-head">{label}{value ? `: ${show(value)}` : ""}</p>
          <Calendar today={today} startMonth={value && value > today ? value : today} onPick={d => { setValue(d); setOpen(false); }}
            dayState={d => ({ disabled: d < today, className: d === value ? "sel" : "" })} />
          <div className="dr-foot">
            <button type="button" className="linkbtn" onClick={() => { setValue(""); setOpen(false); }}>Clear ({emptyText.toLowerCase()})</button>
            <span className="spacer" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

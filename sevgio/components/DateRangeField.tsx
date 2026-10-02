"use client";
import { useEffect, useRef, useState } from "react";
import { Calendar } from "./Calendar.tsx";

const show = (d: string) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");

/**
 * Check-in and check-out for the search form, with the site's own calendar (the same one as on each listing),
 * so it works the same on phones and computers: pick check-in, the calendar moves on to check-out by itself,
 * then it closes and the form moves on to Guests.
 */
export function DateRangeField({ today, initialCi, initialCo, ciLabel, coLabel }: { today: string; initialCi: string; initialCo: string; ciLabel: string; coLabel: string }) {
  const valid = initialCi >= today && initialCo > initialCi;
  const [ci, setCi] = useState(valid ? initialCi : "");
  const [co, setCo] = useState(valid ? initialCo : "");
  const [open, setOpen] = useState<"" | "ci" | "co">("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Picking Where opens check-in straight away.
    const form = box.current?.closest("form");
    const onWhere = () => setOpen("ci");
    form?.addEventListener("sevgio:where-picked", onWhere);
    return () => form?.removeEventListener("sevgio:where-picked", onWhere);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen("");
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const pick = (d: string) => {
    if (open === "ci" || !ci || d <= ci) {
      setCi(d);
      if (co && co <= d) setCo("");
      setOpen("co");
      return;
    }
    setCo(d);
    setOpen("");
    // Dates done: move on to Guests.
    setTimeout(() => box.current?.dispatchEvent(new CustomEvent("sevgio:dates-picked", { bubbles: true })), 0);
  };
  const dayState = (d: string) => ({
    disabled: d < today || (open === "co" && !!ci && d < ci),
    className: d === ci || d === co ? "sel" : ci && co && d > ci && d < co ? "in" : "",
  });

  return (
    <div className={`dr${open ? " open" : ""}`} ref={box}>
      <input type="hidden" name="ci" value={ci} />
      <input type="hidden" name="co" value={co} />
      <button type="button" className={`field dr-field${open === "ci" ? " on" : ""}`} aria-label={`${ciLabel}${ci ? `: ${show(ci)}` : ""}`} aria-expanded={open === "ci"} onClick={() => setOpen(open === "ci" ? "" : "ci")}>
        <span>{ciLabel}</span><b className={ci ? "" : "dr-ph"}>{ci ? show(ci) : "Add date"}</b>
      </button>
      <button type="button" className={`field dr-field${open === "co" ? " on" : ""}`} aria-label={`${coLabel}${co ? `: ${show(co)}` : ""}`} aria-expanded={open === "co"} onClick={() => setOpen(open === "co" ? "" : ci ? "co" : "ci")}>
        <span>{coLabel}</span><b className={co ? "" : "dr-ph"}>{co ? show(co) : "Add date"}</b>
      </button>
      {open && (
        <div className="dr-pop" role="dialog" aria-label={open === "ci" ? `Choose ${ciLabel.toLowerCase()}` : `Choose ${coLabel.toLowerCase()}`}>
          <p className="dr-head" aria-live="polite">{open === "ci" ? "When do you arrive?" : `When do you leave? Check-in ${show(ci)}`}</p>
          <Calendar key={open === "co" ? ci : "ci"} today={today} startMonth={ci || today} dayState={dayState} onPick={pick} />
          <div className="dr-foot">
            {(ci || co) && <button type="button" className="linkbtn" onClick={() => { setCi(""); setCo(""); setOpen("ci"); }}>Clear dates</button>}
            <span className="spacer" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen("")}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { Calendar, addDaysC } from "./Calendar.tsx";
import { ActionForm, SubmitButton } from "./forms.tsx";
import type { ActionState } from "@/lib/validate.ts";

/** Host view: booked nights (yellow), blocked nights (striped). Click two dates to block the nights between them. */
export function HostCalendar({ propertyId, today, booked, blocked, action }: { propertyId: string; today: string; booked: string[]; blocked: string[]; action: (s: ActionState, fd: FormData) => Promise<ActionState> }) {
  const b = new Set(booked), k = new Set(blocked);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const pick = (d: string) => {
    if (!start || end || d <= start) { setStart(d); setEnd(""); return; }
    setEnd(d);
  };
  const dayState = (d: string) => {
    const cls = b.has(d) ? "booked-host" : k.has(d) ? "blocked-host" : d === start || d === end ? "sel" : start && end && d > start && d < end ? "in" : "";
    return { disabled: d < today, className: cls, note: b.has(d) ? "booked" : k.has(d) ? "blocked" : "open" };
  };
  return (
    <div className="box">
      <Calendar today={today} dayState={dayState} onPick={pick} />
      <div className="legend">
        <span><i style={{ background: "var(--warn-soft)", border: "1px solid var(--warn)" }} />Booked</span>
        <span><i style={{ background: "repeating-linear-gradient(135deg,var(--surface-2) 0 3px,transparent 3px 6px)", border: "1px solid var(--line)" }} />Blocked</span>
        <span><i style={{ border: "1px solid var(--line)" }} />Open</span>
      </div>
      <ActionForm action={action} className="stack" resetOnOk>
        <input type="hidden" name="id" value={propertyId} />
        <p className="muted">Click the first night and then the day after the last night (like check-in and check-out), or type the dates.</p>
        <div className="grid-2">
          <label className="field"><span>First blocked night</span><input className="input" type="date" name="start" min={today} value={start} onChange={e => setStart(e.target.value)} /></label>
          <label className="field"><span>Open again from</span><input className="input" type="date" name="end" min={start ? addDaysC(start, 1) : today} value={end} onChange={e => setEnd(e.target.value)} /></label>
        </div>
        <label className="field"><span>Note (only you see this)</span><input className="input" name="note" placeholder="e.g. Owner stay, maintenance" /></label>
        <div><SubmitButton pendingText="Blocking…">Block these dates</SubmitButton></div>
      </ActionForm>
    </div>
  );
}

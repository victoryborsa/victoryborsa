"use client";
import { useState } from "react";
import { Calendar, addDaysC } from "./Calendar.tsx";
import { ActionForm, SubmitButton } from "./forms.tsx";
import { DateRangePicker } from "./DatePicker.tsx";
import type { ActionState } from "@/lib/validate.ts";
import { money, moneyShort } from "@/lib/money.ts";
import { nightPrice, priceWhy, type SmartListing } from "@/lib/smart-pricing.ts";

type Action = (s: ActionState, fd: FormData) => Promise<ActionState>;
const fmt = (s: string) => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Host view: every night in its own box with its rate. Booked nights (yellow), blocked nights (striped).
 *  Click two dates to pick nights, then set their price or block them. */
export function HostCalendar({ propertyId, today, booked, blocked, pricing, monthly, action, priceAction }: {
  propertyId: string; today: string; booked: string[]; blocked: string[]; pricing: SmartListing; monthly: boolean; action: Action; priceAction: Action;
}) {
  const b = new Set(booked), k = new Set(blocked);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const pick = (d: string) => {
    if (!start || end || d <= start) { setStart(d); setEnd(""); return; }
    setEnd(d);
  };
  const dayState = (d: string) => {
    const cls = b.has(d) ? "booked-host" : k.has(d) ? "blocked-host" : d === start || d === end ? "sel" : start && end && d > start && d < end ? "in" : "";
    const show = d >= today && !b.has(d) && !monthly;
    const cents = show ? nightPrice(pricing, d, today) : 0;
    const tone = !show ? undefined : pricing.prices?.[d] ? "set" as const : cents > pricing.nightly_price_cents ? "up" as const : cents < pricing.nightly_price_cents ? "down" as const : undefined;
    return { disabled: d < today, className: cls, note: b.has(d) ? "booked" : k.has(d) ? "blocked" : "open", price: show ? moneyShort(cents) : undefined, priceTone: tone };
  };
  const nights = start ? (end ? Math.round((Date.parse(end) - Date.parse(start)) / 86400000) : 1) : 0;
  const until = end || (start ? addDaysC(start, 1) : "");
  return (
    <div className="box">
      <Calendar today={today} dayState={dayState} onPick={pick} boxed />
      <div className="legend cal-legend">
        <span><i style={{ background: "var(--warn-soft)", border: "1px solid var(--warn)" }} />Booked</span>
        <span><i style={{ background: "repeating-linear-gradient(135deg,var(--surface-2) 0 3px,transparent 3px 6px)", border: "1px solid var(--line)" }} />Blocked</span>
        <span><i style={{ border: "1px solid var(--line)" }} />Open</span>
        {!monthly && <>
          <span><b style={{ color: "var(--gold)" }}>$</b>Above your normal price</span>
          <span><b style={{ color: "var(--ok)" }}>$</b>Below it</span>
          <span><b style={{ textDecoration: "underline dotted" }}>$</b>Price you set</span>
        </>}
      </div>
      {start && !monthly && (
        <p className="pc-why" aria-live="polite">
          <b>{fmt(start)}</b>: {money(nightPrice(pricing, start, today))} a night. <span className="muted">{priceWhy(pricing, start, today)}</span>
        </p>
      )}
      <p className="muted" style={{ marginTop: 12 }}>Click the first night and then the day after the last night (like check-in and check-out), or pick them below. One click picks a single night.</p>
      <DateRangePicker id="pc-dates" today={today} min={today} names={["", ""]} labels={["First night", "Day after the last night"]} endOptional
        value={{ ci: start, co: end }} onChange={v => { setStart(v.ci); setEnd(v.co); }} />
      <div className="pc-tools" style={{ marginTop: 12 }}>
        {!monthly && (
          <ActionForm action={priceAction} className="pc-tool stack" resetOnOk>
            <input type="hidden" name="id" value={propertyId} />
            <input type="hidden" name="start" value={start} />
            <input type="hidden" name="end" value={until} />
            <h4>Set the nightly price</h4>
            <p className="hint">{nights ? `${nights} night${nights === 1 ? "" : "s"} picked. ` : "Pick nights on the calendar first. "}Your price replaces the normal price{pricing.smart_pricing ? " and Smart Pricing" : ""} on these nights. Booked stays keep their price.</p>
            <label className="field"><span>Price per night (USD)</span><input className="input mono" name="price" inputMode="decimal" placeholder={String(Math.round(pricing.nightly_price_cents / 100))} /></label>
            <div className="row">
              <SubmitButton pendingText="Saving…" disabled={!start}>Save price</SubmitButton>
              <SubmitButton className="btn btn-ghost" name="mode" value="clear" pendingText="Saving…" disabled={!start}>Use {pricing.smart_pricing ? "Smart Pricing" : "normal price"} again</SubmitButton>
            </div>
          </ActionForm>
        )}
        <ActionForm action={action} className="pc-tool stack" resetOnOk>
          <input type="hidden" name="id" value={propertyId} />
          <input type="hidden" name="start" value={start} />
          <input type="hidden" name="end" value={until} />
          <h4>Block nights</h4>
          <p className="hint">Guests can't book blocked nights.</p>
          <label className="field"><span>Note (only you see this)</span><input className="input" name="note" placeholder="e.g. Owner stay, maintenance" /></label>
          <div><SubmitButton pendingText="Blocking…" disabled={!start}>Block these dates</SubmitButton></div>
        </ActionForm>
      </div>
    </div>
  );
}

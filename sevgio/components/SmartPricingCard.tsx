"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "./forms.tsx";
import type { ActionState } from "@/lib/validate.ts";

export type SmartPricingData = { id: string; on: boolean; min: string; max: string; base: string; monthly: boolean };

/** One switch to turn Smart Pricing on or off for a listing, with its lowest and highest nightly price. */
export function SmartPricingCard({ d, action, compact = false }: { d: SmartPricingData; action: (s: ActionState, fd: FormData) => Promise<ActionState>; compact?: boolean }) {
  const [on, setOn] = useState(d.on);
  if (d.monthly) return <div className={`sp-card${compact ? " compact" : ""}`}><b>Smart Pricing</b><p className="hint">This home is rented by the month, so Smart Pricing (nightly prices that follow demand) doesn't apply.</p></div>;
  return (
    <ActionForm action={action} className={`sp-card stack${compact ? " compact" : ""}`}>
      <input type="hidden" name="id" value={d.id} />
      <label className="sp-switch">
        <input type="checkbox" name="smart" role="switch" checked={on} onChange={e => setOn(e.target.checked)} aria-describedby={`sp-help-${d.id}`} />
        <span className="sp-track" aria-hidden><i /></span>
        <span><b>Smart Pricing</b> <span className={`pill ${on ? "ok" : "neutral"}`}>{on ? "On" : "Off"}</span></span>
      </label>
      <p className="hint" id={`sp-help-${d.id}`}>
        Starts from your normal price ({d.base}) and moves with demand: higher on weekends, holidays, Steelers, Penguins and Pirates home games, big concerts and events,
        and when most Sevgio homes are booked; about 10% lower for empty nights in the next 3 days. It never goes below your lowest or above your highest price.
        Booked stays keep the price they were booked at.
      </p>
      <div className="grid-2">
        <label className="field"><span>Lowest price per night (USD)</span><input className="input mono" name="min_price" inputMode="decimal" defaultValue={d.min} placeholder="90" required={on} /></label>
        <label className="field"><span>Highest price per night (USD)</span><input className="input mono" name="max_price" inputMode="decimal" defaultValue={d.max} placeholder="149" required={on} /></label>
      </div>
      <div><SubmitButton pendingText="Saving…">Save Smart Pricing</SubmitButton></div>
    </ActionForm>
  );
}

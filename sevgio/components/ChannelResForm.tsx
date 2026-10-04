import { ActionForm, SubmitButton } from "./forms.tsx";
import { saveChannelResAction } from "@/app/actions/channel.ts";
import { CHANNELS } from "@/lib/channels.ts";

export type ChannelResValues = {
  id?: string; kind?: string; external_ref?: string; guest_name?: string; guests?: number | null; note?: string;
  rent_cents?: number | null; cleaning_cents?: number | null; other_cents?: number | null; tax_cents?: number | null; commission_cents?: number | null;
  refund_cents?: number | null; expected_payout_cents?: number | null; received_payout_cents?: number | null; payout_date?: string | null;
};

const dollars = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));

/** Payout details for a reservation from another site. Empty boxes mean "not known yet" and show as "Needs entry", never $0. */
export function ChannelResForm({ v, listings }: { v: ChannelResValues; listings?: { id: string; name: string }[] }) {
  const money = (name: string, label: string, val: number | null | undefined, hint?: string) => (
    <label className="field"><span>{label}</span><input className="input mono" name={name} inputMode="decimal" defaultValue={dollars(val)} placeholder="Needs entry" aria-describedby={hint ? name + "-h" : undefined} />{hint && <small id={name + "-h"} className="hint">{hint}</small>}</label>
  );
  return (
    <ActionForm action={saveChannelResAction} className="stack">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      {listings && (
        <div className="grid-2">
          <label className="field"><span>Listing (home or room)</span><select className="input" name="property" required defaultValue=""><option value="" disabled>Choose…</option>{listings.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="field"><span>Booked on</span><select className="input" name="channel" defaultValue="airbnb">{CHANNELS.filter(c => c[0] !== "sevgio").map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
          <label className="field"><span>Check-in</span><input className="input" type="date" name="check_in" required /></label>
          <label className="field"><span>Check-out</span><input className="input" type="date" name="check_out" required /></label>
        </div>
      )}
      <div className="grid-2">
        <label className="field"><span>What is it?</span><select className="input" name="kind" defaultValue={v.kind === "blocked" ? "blocked" : "reservation"}><option value="reservation">A guest reservation</option><option value="blocked">Blocked or closed dates (no guest)</option></select></label>
        <label className="field"><span>Confirmation code</span><input className="input mono" name="ref" defaultValue={v.external_ref || ""} placeholder="e.g. HMABC12345" /></label>
        <label className="field"><span>Guest name</span><input className="input" name="guest_name" defaultValue={v.guest_name || ""} /></label>
        <label className="field"><span>Guests</span><input className="input" name="guests" inputMode="numeric" defaultValue={v.guests ?? ""} /></label>
      </div>
      <fieldset className="stack fin-fields">
        <legend>Money (USD). Leave a box empty if you don&apos;t know it yet.</legend>
        <div className="grid-2">
          {money("rent", "Rental income (nights, after discounts)", v.rent_cents)}
          {money("cleaning", "Cleaning fee", v.cleaning_cents)}
          {money("other", "Other charges (pet fee, extra guests, extras)", v.other_cents)}
          {money("tax", "Taxes", v.tax_cents, "Occupancy tax the guest paid. Airbnb and Vrbo usually pay Pennsylvania's tax for you.")}
          {money("commission", "Platform commission / service fee", v.commission_cents)}
          {money("refund", "Refunds to the guest", v.refund_cents)}
          {money("expected", "Expected payout", v.expected_payout_cents, "What the site will pay you for this reservation.")}
          {money("received", "Received so far", v.received_payout_cents)}
          <label className="field"><span>Payout date</span><input className="input" type="date" name="payout_date" defaultValue={v.payout_date || ""} /></label>
        </div>
      </fieldset>
      <label className="field"><span>Note</span><textarea className="input" name="note" rows={2} defaultValue={v.note || ""} /></label>
      <div><SubmitButton pendingText="Saving…">{v.id ? "Save" : "Add reservation"}</SubmitButton></div>
    </ActionForm>
  );
}

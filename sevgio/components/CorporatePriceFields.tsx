"use client";
import { useState } from "react";
import { DatePicker } from "./DatePicker.tsx";
import { money, toCents } from "@/lib/money.ts";

/**
 * Add Manual Reservation → corporate housing: a total agreed with the guest instead of the nightly rates,
 * the deposit, and when the rest is due. The remaining balance and the card total are worked out as you type.
 */
export function CorporatePriceFields({ today, cardFeeCents, ways }: { today: string; cardFeeCents: number; ways: string[] }) {
  const [on, setOn] = useState(false);
  const [total, setTotal] = useState("");
  const [deposit, setDeposit] = useState("");
  const t = toCents(total) ?? 0, d = Math.min(toCents(deposit) ?? 0, t);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <label className="chk"><input type="checkbox" name="fixed_price" checked={on} onChange={e => setOn(e.target.checked)} />Corporate housing: use a fixed negotiated price instead of the nightly rates</label>
      {on && (
        <div className="box stack" style={{ gap: 12, background: "var(--surface-2)" }} data-testid="corporate-price">
          <div className="grid-2">
            <label className="field"><span>Total price for the stay (USD)</span><input className="input mono" name="fixed_total" inputMode="decimal" placeholder="3000" value={total} onChange={e => setTotal(e.target.value)} required /></label>
            <label className="field"><span>Deposit required (USD)</span><input className="input mono" name="fixed_deposit" inputMode="decimal" placeholder="500" value={deposit} onChange={e => setDeposit(e.target.value)} /><span className="hint">Leave empty or 0 for no deposit.</span></label>
          </div>
          <DatePicker name="payment_due" label="Remaining balance due by" today={today} min={today} maxMonths={36} hint="Optional. Shown on the invoice and payment request." />
          {t > 0 && (
            <table className="breakdown" aria-label="Price summary">
              <tbody>
                <tr><td>Total price</td><td>{money(t)}</td></tr>
                {d > 0 && <tr><td>Deposit</td><td>{money(d)}</td></tr>}
                <tr className="total"><td>Remaining balance</td><td>{money(t - d)}</td></tr>
                {cardFeeCents > 0 && <tr><td>If paid by card, a {money(cardFeeCents)} processing fee is added to each card payment</td><td>{money(t + cardFeeCents)}</td></tr>}
              </tbody>
            </table>
          )}
          <p className="hint">No nightly rates, cleaning fee or tax are added. The guest is emailed a confirmation and payment request, and can pay {ways.join(", ")}. You mark Venmo and Cash App payments received on the reservation.</p>
        </div>
      )}
    </div>
  );
}

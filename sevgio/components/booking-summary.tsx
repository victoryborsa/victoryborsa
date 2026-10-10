import type { Booking } from "@/lib/bookings.ts";
import { money } from "@/lib/money.ts";
import { extrasOf } from "@/lib/party.ts";
import { paymentStatus } from "@/lib/statuses.ts";

const fmtDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The booking's price, line by line, with what has been paid. Used on the trip page, the invoice and the admin record. */
export function PriceBreakdown({ b }: { b: Booking }) {
  return (
    <table className="breakdown">
      <tbody>
        {b.fixed_price
          ? <tr><td>Corporate housing, {b.nights} night{b.nights === 1 ? "" : "s"} (fixed price)</td><td>{money(b.lodging_cents)}</td></tr>
          : <tr><td>{money(b.nightly_price_cents)} × {b.nights} night{b.nights === 1 ? "" : "s"}</td><td>{money(b.lodging_cents)}</td></tr>}
        {b.discount_cents > 0 && <tr><td>Length-of-stay discount</td><td>−{money(b.discount_cents)}</td></tr>}
        {b.cleaning_fee_cents > 0 && <tr><td>Cleaning fee</td><td>{money(b.cleaning_fee_cents)}</td></tr>}
        {b.pet_fee_cents > 0 && <tr><td>Pet fee ({b.pets} pet{b.pets === 1 ? "" : "s"})</td><td>{money(b.pet_fee_cents)}</td></tr>}
        {extrasOf(b).map(x => <tr key={x.key}><td>{x.name}{x.qty > 1 && x.total ? ` × ${x.qty}` : ""}{x.details && <div className="hint">{x.details}</div>}</td><td>{x.total ? money(x.total) : "Free"}</td></tr>)}
        {b.tax_cents > 0 && <tr><td>Taxes</td><td>{money(b.tax_cents)}</td></tr>}
        {b.card_fee_cents > 0 && <tr><td>Card processing fee</td><td>{money(b.card_fee_cents)}</td></tr>}
        <tr className="total"><td>Total</td><td>{money(b.total_cents + b.card_fee_cents)}</td></tr>
        {b.paid_cents > 0 && <tr><td>Paid{b.payment_status === "processing" ? " (bank transfer processing)" : ""}</td><td>{money(b.paid_cents + (b.payment_method === "card" ? b.card_fee_cents : 0))}</td></tr>}
        {b.payment_method === "cash" && b.status === "confirmed" && b.paid_cents < b.total_cents && <tr><td>Due in cash at check-in</td><td>{money(b.total_cents - b.paid_cents)}</td></tr>}
        {b.fixed_price && b.status !== "cancelled" && b.paid_cents < b.deposit_due_cents && <tr><td>Deposit due now</td><td>{money(b.deposit_due_cents - b.paid_cents)}</td></tr>}
        {b.fixed_price && b.status !== "cancelled" && b.paid_cents < b.total_cents && <tr><td>Remaining balance{b.payment_due_date ? `, due ${fmtDay(b.payment_due_date)}` : ""}</td><td>{money(b.total_cents - Math.max(b.paid_cents, b.deposit_due_cents))}</td></tr>}
      </tbody>
    </table>
  );
}

/** Payment status as a colored pill. */
export function PaymentPill({ b }: { b: Booking }) {
  const p = paymentStatus(b);
  return <><span className={`pill ${p.tone}`}>{p.label}</span>{p.detail && <span className="hint"> {p.detail}</span>}</>;
}

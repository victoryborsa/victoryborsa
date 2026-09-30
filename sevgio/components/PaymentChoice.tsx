import { METHOD_LABEL, dueNow, type PayMethod } from "@/lib/payment-rules.ts";
import { money } from "@/lib/money.ts";
import type { Settings } from "@/lib/settings.ts";

/** Radio list of payment options with what each one costs the guest now and later. */
export function PaymentChoice({ methods, total, s, request }: { methods: PayMethod[]; total: number; s: Settings; request: boolean }) {
  const hours = s.manual_payment_hours;
  const detail = (m: PayMethod) => {
    const d = dueNow(m, total, s);
    if (m === "card") return `${money(total + d.fee)} now, including a ${money(d.fee)} card processing fee. Paid securely through Stripe.`;
    if (m === "ach") return `${money(total)} from your US bank account through Stripe. No extra fee.`;
    if (m === "zelle") return `${money(total)} by Zelle within ${hours} hours. No extra fee.`;
    if (m === "venmo") return `${money(total)} by Venmo within ${hours} hours. No extra fee.`;
    return `${money(d.now)} deposit (${s.deposit_percent}%) by Zelle or Venmo within ${hours} hours, then ${money(d.later)} in cash at check-in.`;
  };
  return (
    <fieldset style={{ border: "1px solid var(--line)", borderRadius: "var(--r)", padding: 14, margin: 0 }} className="stack">
      <legend style={{ padding: "0 6px", fontWeight: 700 }}>How would you like to pay?</legend>
      {methods.map((m, i) => (
        <label key={m} className="chk" style={{ alignItems: "flex-start" }}>
          <input type="radio" name="payment_method" value={m} defaultChecked={i === 0} style={{ marginTop: 3 }} />
          <span><b>{METHOD_LABEL[m]}</b><br /><span className="hint">{detail(m)}</span></span>
        </label>
      ))}
      <span className="hint">{request ? "You'll pay after the host accepts your request. Your dates are held until then." : "Your dates are held while you pay. If payment doesn't arrive in time, the booking is cancelled automatically."}</span>
    </fieldset>
  );
}

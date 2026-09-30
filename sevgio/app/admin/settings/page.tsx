import { requireUser } from "@/lib/auth.ts";
import { getSettings } from "@/lib/settings.ts";
import { stripeReady } from "@/lib/payments.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { saveSettingsAction } from "@/app/actions/admin.ts";

export default async function Settings() {
  await requireUser(["admin"], "/admin");
  const s = await getSettings();
  const stripe = stripeReady();
  return (
    <ActionForm action={saveSettingsAction} className="box" id="settings">
      <h2>Site settings</h2>
      <label className="field" style={{ maxWidth: 260 }}>
        <span>Lodging tax added to bookings (%)</span>
        <input className="input mono" name="tax_percent" inputMode="decimal" defaultValue={s.tax_percent} />
        <span className="hint">Pennsylvania charges a 6% hotel occupancy tax, and many counties and cities add their own. Check with your accountant for the right total. Use 0 if you collect tax another way.</span>
      </label>
      <div className="grid-2">
        <label className="field"><span>Contact email (shown on the site; receives contact messages)</span><input className="input" name="contact_email" type="email" defaultValue={s.contact_email} /></label>
        <label className="field"><span>Contact phone (optional)</span><input className="input" name="contact_phone" defaultValue={s.contact_phone} /></label>
      </div>
      <label className="field"><span>Payment note (shown when guests book)</span><textarea className="input" name="payment_note" defaultValue={s.payment_note} style={{ minHeight: 70 }} /><span className="hint">Online payment isn't switched on. This tells guests how they'll pay.</span></label>
      <label className="field"><span>Site-wide notice (optional banner at the top of every page)</span><input className="input" name="site_notice" defaultValue={s.site_notice} placeholder="e.g. Winter weekends are booking fast. Reserve early!" /></label>
      <h2 style={{ marginTop: 12 }}>Payments</h2>
      <p className="muted">Choose how guests can pay. When at least one option is on, bookings wait for payment before they're confirmed, and unpaid bookings are cancelled automatically.</p>
      {!stripe && <div className="notice warn">Card and bank transfer need a Stripe account. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Render → Environment, then they can be switched on.</div>}
      <div className="stack" style={{ gap: 10 }}>
        <label className="chk"><input type="checkbox" name="pay_card" defaultChecked={s.pay_card} disabled={!stripe} />Credit or debit card (Stripe). The card processing fee is added to the guest's total.</label>
        <div className="grid-2" style={{ paddingLeft: 28 }}>
          <label className="field"><span>Card fee (%)</span><input className="input mono" name="card_fee_percent" inputMode="decimal" defaultValue={s.card_fee_percent} /></label>
          <label className="field"><span>Card fixed fee (USD)</span><input className="input mono" name="card_fee_fixed" inputMode="decimal" defaultValue={(s.card_fee_fixed_cents / 100).toFixed(2)} /><span className="hint">Stripe's US rate is 2.9% + $0.30</span></label>
        </div>
        <label className="chk"><input type="checkbox" name="pay_ach" defaultChecked={s.pay_ach} disabled={!stripe} />Bank transfer / ACH (Stripe). You pay 0.8%, max $5. Takes a few days to clear.</label>
        <label className="chk"><input type="checkbox" name="pay_zelle" defaultChecked={s.pay_zelle} />Zelle (free). You confirm when the money arrives.</label>
        <label className="field" style={{ paddingLeft: 28, maxWidth: 420 }}><span>Zelle: send to (email or phone)</span><input className="input" name="zelle_to" defaultValue={s.zelle_to} placeholder="sevgio.stays@gmail.com" /></label>
        <label className="chk"><input type="checkbox" name="pay_venmo" defaultChecked={s.pay_venmo} />Venmo. You confirm when the money arrives.</label>
        <label className="field" style={{ paddingLeft: 28, maxWidth: 420 }}><span>Venmo username</span><input className="input" name="venmo_handle" defaultValue={s.venmo_handle} placeholder="@Sevgio-Stays" /></label>
        <label className="chk"><input type="checkbox" name="pay_cash" defaultChecked={s.pay_cash} />Cash at arrival, with a deposit by Zelle or Venmo</label>
        <div className="grid-2" style={{ paddingLeft: 28 }}>
          <label className="field"><span>Deposit for cash at arrival (%)</span><input className="input mono" name="deposit_percent" inputMode="decimal" defaultValue={s.deposit_percent} /></label>
          <label className="field"><span>Hours to pay by Zelle / Venmo</span><input className="input mono" name="manual_payment_hours" type="number" min={1} max={72} defaultValue={s.manual_payment_hours} /><span className="hint">Unpaid bookings are cancelled after this</span></label>
        </div>
      </div>
      <div><SubmitButton pendingText="Saving…">Save settings</SubmitButton></div>
    </ActionForm>
  );
}

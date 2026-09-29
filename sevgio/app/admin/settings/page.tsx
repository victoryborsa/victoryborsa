import { requireUser } from "@/lib/auth.ts";
import { getSettings } from "@/lib/settings.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { saveSettingsAction } from "@/app/actions/admin.ts";

export default async function Settings() {
  await requireUser(["admin"], "/admin");
  const s = await getSettings();
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
      <div><SubmitButton pendingText="Saving…">Save settings</SubmitButton></div>
    </ActionForm>
  );
}

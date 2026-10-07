import type { Metadata } from "next";
import { mailUrl, telUrl } from "@/lib/links.ts";
import { currentUser } from "@/lib/auth.ts";
import { getSettings } from "@/lib/settings.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { contactAction } from "@/app/actions/messages.ts";
import { pageMeta } from "@/lib/seo.tsx";
import { q } from "@/lib/db.ts";

export const metadata: Metadata = pageMeta("/contact", "Contact us", "Questions about a furnished stay, a reservation or corporate housing in Pittsburgh? Contact Sevgio. We reply within a few hours, every day.");
export const dynamic = "force-dynamic";

export default async function Contact({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const ref = ((await searchParams).ref || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 20);
  const [u, s, homes] = await Promise.all([currentUser(), getSettings(), q<{ id: string; title: string }>("SELECT id, title FROM properties WHERE status = 'published' ORDER BY title")]);
  return (
    <div className="wrap photo-page theme-light">
      <ActionForm action={contactAction} className="auth box" resetOnOk>
        <h1 style={{ fontSize: 30 }}>Contact us</h1>
        <p className="muted">We reply within a few hours, every day. The reservation details below are optional; they help us find your stay faster.</p>
        <div className="grid-2">
          <label className="field"><span>Name</span><input className="input" name="name" autoComplete="name" defaultValue={u?.name} required /></label>
          <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" defaultValue={u?.email} required /></label>
        </div>
        <label className="field">
          <span>Topic</span>
          <select className="input" name="topic"><option>Question before booking</option><option>Existing booking</option><option>Listing my home with Sevgio</option><option>Something else</option></select>
        </label>
        <fieldset className="contact-extra">
          <legend>Reservation details <span className="muted">(optional)</span></legend>
          <div className="grid-2">
            <label className="field"><span>Reservation number</span><input className="input mono" name="reservation" placeholder="SV-… or the other site's code" autoComplete="off" defaultValue={ref} /></label>
            <label className="field"><span>Phone</span><input className="input" name="phone" type="tel" autoComplete="tel" /></label>
            <label className="field"><span>Property</span>
              <select className="input" name="property" defaultValue=""><option value="">Not about a specific home</option>{homes.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}</select>
            </label>
            <label className="field"><span>Check-in date</span><input className="input" name="check_in" type="date" /></label>
          </div>
        </fieldset>
        <label className="field"><span>Message</span><textarea className="input" name="body" required /></label>
        <div style={{ position: "absolute", left: -9999 }} aria-hidden="true"><label>Leave empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <div><SubmitButton pendingText="Sending…">Send message</SubmitButton></div>
        {(s.contact_email || s.contact_phone) && <p className="hint">Or reach us at {s.contact_email && <a href={mailUrl(s.contact_email)}>✉️ {s.contact_email}</a>}{s.contact_email && s.contact_phone && " · "}{s.contact_phone && <a href={telUrl(s.contact_phone)}>📞 {s.contact_phone}</a>}</p>}
      </ActionForm>
    </div>
  );
}

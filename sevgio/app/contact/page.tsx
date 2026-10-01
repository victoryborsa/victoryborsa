import type { Metadata } from "next";
import { mailUrl, telUrl } from "@/lib/links.ts";
import { currentUser } from "@/lib/auth.ts";
import { getSettings } from "@/lib/settings.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { contactAction } from "@/app/actions/messages.ts";

export const metadata: Metadata = { title: "Contact us" };
export const dynamic = "force-dynamic";

export default async function Contact() {
  const [u, s] = await Promise.all([currentUser(), getSettings()]);
  return (
    <div className="wrap">
      <ActionForm action={contactAction} className="auth box" resetOnOk>
        <h1 style={{ fontSize: 30 }}>Contact us</h1>
        <p className="muted">We reply within a few hours, every day. For an existing booking, include your reference (it starts with SV-).</p>
        <div className="grid-2">
          <label className="field"><span>Name</span><input className="input" name="name" autoComplete="name" defaultValue={u?.name} required /></label>
          <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" defaultValue={u?.email} required /></label>
        </div>
        <label className="field">
          <span>Topic</span>
          <select className="input" name="topic"><option>Question before booking</option><option>Existing booking</option><option>Listing my home with Sevgio Stays</option><option>Something else</option></select>
        </label>
        <label className="field"><span>Message</span><textarea className="input" name="body" required /></label>
        <div style={{ position: "absolute", left: -9999 }} aria-hidden="true"><label>Leave empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <div><SubmitButton pendingText="Sending…">Send message</SubmitButton></div>
        {(s.contact_email || s.contact_phone) && <p className="hint">Or reach us at {s.contact_email && <a href={mailUrl(s.contact_email)}>✉️ {s.contact_email}</a>}{s.contact_email && s.contact_phone && " · "}{s.contact_phone && <a href={telUrl(s.contact_phone)}>📞 {s.contact_phone}</a>}</p>}
      </ActionForm>
    </div>
  );
}

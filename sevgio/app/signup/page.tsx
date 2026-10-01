import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { currentUser, safeNext } from "@/lib/auth.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { signUpAction } from "@/app/actions/auth.ts";
import { PasswordInput } from "@/components/PasswordInput.tsx";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next, "");
  if (await currentUser()) redirect(next || "/trips");
  return (
    <div className="wrap">
      <ActionForm action={signUpAction} className="auth box">
        <h1 style={{ fontSize: 30 }}>Create your account</h1>
        <p className="muted">Book in a few taps, see all your trips in one place, and message hosts.</p>
        <input type="hidden" name="next" value={next} />
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>I want to</legend>
          <div className="choice-row">
            <label className="choice"><input type="radio" name="want" value="guest" defaultChecked /><span><b>Book stays</b><small>Guest account</small></span></label>
            <label className="choice"><input type="radio" name="want" value="host" /><span><b>List my home</b><small>Host account, approved by us</small></span></label>
          </div>
        </fieldset>
        <label className="field"><span>Full name</span><input className="input" name="name" autoComplete="name" required /></label>
        <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" required /></label>
        <label className="field"><span>Mobile phone <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></span><input className="input" name="phone" type="tel" autoComplete="tel" /></label>
        <label className="field"><span>Password</span><PasswordInput name="password" autoComplete="new-password" minLength={8} required /><span className="hint">At least 8 characters</span></label>
        <SubmitButton className="btn btn-primary btn-block" pendingText="Creating account…">Create account</SubmitButton>
        <p className="hint">Hosts: choose “List my home”. We'll review your request and email you when your host tools are ready, usually within a day.</p>
        <p style={{ textAlign: "center" }}>Already have an account? <Link href={"/signin" + (next ? "?next=" + encodeURIComponent(next) : "")}>Sign in</Link></p>
      </ActionForm>
    </div>
  );
}

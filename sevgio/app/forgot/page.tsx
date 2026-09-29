import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { forgotPasswordAction } from "@/app/actions/auth.ts";

export const metadata: Metadata = { title: "Reset your password" };

export default function Forgot() {
  return (
    <div className="wrap">
      <ActionForm action={forgotPasswordAction} className="auth box">
        <h1 style={{ fontSize: 30 }}>Reset your password</h1>
        <p className="muted">Enter the email you signed up with. We'll send you a link to choose a new password.</p>
        <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" required /></label>
        <SubmitButton className="btn btn-primary btn-block" pendingText="Sending…">Send reset link</SubmitButton>
        <Link href="/signin">Back to sign in</Link>
      </ActionForm>
    </div>
  );
}

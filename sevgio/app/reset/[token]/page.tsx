import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { resetPasswordAction } from "@/app/actions/auth.ts";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function Reset({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="wrap">
      <ActionForm action={resetPasswordAction} className="auth box">
        <h1 style={{ fontSize: 30 }}>Choose a new password</h1>
        <input type="hidden" name="token" value={token} />
        <label className="field"><span>New password</span><input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required /><span className="hint">At least 8 characters</span></label>
        <label className="field"><span>Type it again</span><input className="input" name="confirm" type="password" autoComplete="new-password" required /></label>
        <SubmitButton className="btn btn-primary btn-block" pendingText="Saving…">Save new password</SubmitButton>
      </ActionForm>
    </div>
  );
}

import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { resetPasswordAction } from "@/app/actions/auth.ts";
import { PasswordInput } from "@/components/PasswordInput.tsx";
import { one } from "@/lib/db.ts";
import { sha256 } from "@/lib/auth.ts";
import { LinkProblem } from "@/components/ResetLinkProblem.tsx";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Reset({ params }: { params: Promise<{ token: string }> }) {
  // Mail apps sometimes add stray characters around a link; keep only what a token can contain.
  const token = decodeURIComponent((await params).token).trim().replace(/[^A-Za-z0-9_-]/g, "");
  const ok = await one("SELECT 1 FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()", [sha256(token)]);
  if (!ok) return <LinkProblem />;
  return (
    <div className="wrap photo-page theme-light">
      <ActionForm action={resetPasswordAction} className="auth box">
        <h1 style={{ fontSize: 30 }}>Choose a new password</h1>
        <input type="hidden" name="token" value={token} />
        <label className="field"><span>New password</span><PasswordInput name="password" autoComplete="new-password" minLength={8} required /><span className="hint">At least 8 characters</span></label>
        <label className="field"><span>Type it again</span><PasswordInput name="confirm" autoComplete="new-password" required /></label>
        <SubmitButton className="btn btn-primary btn-block" pendingText="Saving…">Save new password</SubmitButton>
      </ActionForm>
    </div>
  );
}

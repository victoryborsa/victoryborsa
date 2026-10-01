import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireUser, safeNext } from "@/lib/auth.ts";
import { verificationRequired } from "@/lib/email.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { resendCodeAction, startOverAction, verifyCodeAction } from "@/app/actions/auth.ts";
import { signOutAction } from "@/app/actions/auth.ts";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };
export const dynamic = "force-dynamic";

/** New guests land here right after signing up. The account can't be used until the emailed code is entered. */
export default async function Verify({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next, "/trips");
  const u = await requireUser(undefined, "/verify?next=" + encodeURIComponent(next), { allowUnverified: true });
  if (u.verified || !verificationRequired()) redirect(next);
  return (
    <div className="wrap">
      <div className="auth box">
        <p className="eyebrow">One last step</p>
        <h1 style={{ fontSize: 30 }}>Confirm your email</h1>
        <p>We sent a 6-digit code to <b>{u.email}</b>. Enter it below to finish creating your account. The code works for 15 minutes.</p>
        <ActionForm action={verifyCodeAction} className="stack">
          <input type="hidden" name="next" value={next} />
          <label className="field" style={{ maxWidth: 240 }}><span>6-digit code</span><input className="input mono" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus style={{ fontSize: 24, letterSpacing: ".25em" }} /></label>
          <div><SubmitButton pendingText="Checking…">Confirm email</SubmitButton></div>
        </ActionForm>
        <ActionForm action={resendCodeAction} className="row">
          <span className="hint">No email after a minute? Check your Spam or Promotions folder, or</span>
          <SubmitButton className="linkbtn" pendingText="Sending…">send a new code</SubmitButton>
        </ActionForm>
        <div className="row" style={{ gap: 16 }}>
          <form action={startOverAction}><button className="linkbtn" type="submit">Wrong email? Start over</button></form>
          <form action={signOutAction}><button className="linkbtn" type="submit">Sign out</button></form>
        </div>
      </div>
    </div>
  );
}

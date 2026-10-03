import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth.ts";
import { verificationRequired } from "@/lib/email.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { changePasswordAction, requestHostAction, resendCodeAction, updateProfileAction, verifyCodeAction } from "@/app/actions/auth.ts";
import { one } from "@/lib/db.ts";
import { PasswordInput } from "@/components/PasswordInput.tsx";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function Account({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const u = await requireUser(undefined, "/account");
  const reset = (await searchParams).reset === "1";
  const hostReq = u.role === "customer" ? !!(await one("SELECT 1 FROM users WHERE id = $1 AND host_requested_at IS NOT NULL", [u.id])) : false;
  return (
    <div className="wrap page-pad" style={{ maxWidth: 760 }}>
      <p className="eyebrow">Your account</p>
      <h1 style={{ fontSize: "clamp(26px,4vw,36px)", marginBottom: 8 }}>Hi, {u.name.split(" ")[0]}</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        {u.role === "admin" ? <>You're an administrator. <Link href="/admin">Open the admin dashboard</Link>.</> : u.role === "host" ? <>You're a host. <Link href="/host">Open your host dashboard</Link>.</> : <>See your bookings in <Link href="/trips">My trips</Link>.</>}
      </p>
      {reset && <div className="notice ok" style={{ marginBottom: 16 }}>Your password has been changed and you're signed in.</div>}
      {u.role === "customer" && <div id="become-host" style={{ scrollMarginTop: 90 }}>{hostReq
        ? <div className="notice info" style={{ marginBottom: 16 }}><b>Your host request is being reviewed.</b> We'll email you when your host tools are ready, usually within a day.</div>
        : <ActionForm action={requestHostAction} className="row box" ><span style={{ flex: 1, minWidth: 220 }}><b>Have a home in Pittsburgh?</b> List it on Sevgio Stays.</span><SubmitButton className="btn btn-ghost btn-sm" pendingText="Sending…">Become a host</SubmitButton></ActionForm>}</div>}
      {!u.verified && verificationRequired() && (
        <div className="box" style={{ marginBottom: 20 }}>
          <h2>Confirm your email</h2>
          <p>Enter the 6-digit code we sent to <b>{u.email}</b>. You need it before you can book.</p>
          <ActionForm action={verifyCodeAction} className="row">
            <input type="hidden" name="next" value="/account" />
            <input className="input mono" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} aria-label="6-digit code" style={{ maxWidth: 180 }} />
            <SubmitButton pendingText="Checking…">Confirm</SubmitButton>
          </ActionForm>
          <ActionForm action={resendCodeAction} className="row"><SubmitButton className="linkbtn" pendingText="Sending…">Send a new code</SubmitButton></ActionForm>
        </div>
      )}
      <div className="stack" style={{ gap: 20 }}>
        <ActionForm action={updateProfileAction} className="box">
          <h2>Profile</h2>
          <div className="grid-2">
            <label className="field"><span>Full name</span><input className="input" name="name" defaultValue={u.name} autoComplete="name" /></label>
            <label className="field"><span>Mobile phone</span><input className="input" name="phone" type="tel" defaultValue={u.phone} autoComplete="tel" /></label>
          </div>
          <label className="field"><span>Email</span><input className="input" name="email" type="email" defaultValue={u.email} autoComplete="email" /></label>
          <div><SubmitButton pendingText="Saving…">Save profile</SubmitButton></div>
        </ActionForm>
        <ActionForm action={changePasswordAction} className="box" resetOnOk>
          <h2>Password</h2>
          <div className="grid-2">
            <label className="field"><span>Current password</span><PasswordInput name="current" autoComplete="current-password" /></label>
            <label className="field"><span>New password</span><PasswordInput name="password" autoComplete="new-password" /><span className="hint">At least 8 characters</span></label>
          </div>
          <div><SubmitButton pendingText="Saving…">Change password</SubmitButton></div>
        </ActionForm>
      </div>
    </div>
  );
}

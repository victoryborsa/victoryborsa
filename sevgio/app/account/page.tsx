import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { changePasswordAction, updateProfileAction } from "@/app/actions/auth.ts";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function Account({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const u = await requireUser(undefined, "/account");
  const reset = (await searchParams).reset === "1";
  return (
    <div className="wrap page-pad" style={{ maxWidth: 760 }}>
      <p className="eyebrow">Your account</p>
      <h1 style={{ fontSize: "clamp(26px,4vw,36px)", marginBottom: 8 }}>Hi, {u.name.split(" ")[0]}</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        {u.role === "admin" ? <>You're an administrator. <Link href="/admin">Open the admin dashboard</Link>.</> : u.role === "host" ? <>You're a host. <Link href="/host">Open your host dashboard</Link>.</> : <>See your bookings in <Link href="/trips">My trips</Link>.</>}
      </p>
      {reset && <div className="notice ok" style={{ marginBottom: 16 }}>Your password has been changed and you're signed in.</div>}
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
            <label className="field"><span>Current password</span><input className="input" name="current" type="password" autoComplete="current-password" /></label>
            <label className="field"><span>New password</span><input className="input" name="password" type="password" autoComplete="new-password" /><span className="hint">At least 8 characters</span></label>
          </div>
          <div><SubmitButton pendingText="Saving…">Change password</SubmitButton></div>
        </ActionForm>
      </div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { currentUser, safeNext } from "@/lib/auth.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { signInAction } from "@/app/actions/auth.ts";
import { PasswordInput } from "@/components/PasswordInput.tsx";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next, "");
  if (await currentUser()) redirect(next || "/trips");
  return (
    <div className="wrap">
      <ActionForm action={signInAction} className="auth box">
        <h1 style={{ fontSize: 30 }}>Sign in</h1>
        {next.startsWith("/book/") && <div className="notice info">Sign in or create an account to finish your booking. Your dates are saved.</div>}
        <input type="hidden" name="next" value={next} />
        <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" required autoFocus /></label>
        <label className="field"><span>Password</span><PasswordInput name="password" autoComplete="current-password" required /></label>
        <SubmitButton className="btn btn-primary btn-block" pendingText="Signing in…">Sign in</SubmitButton>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Link href="/forgot">Forgot your password?</Link>
          <Link href={"/signup" + (next ? "?next=" + encodeURIComponent(next) : "")}>Create an account</Link>
        </div>
      </ActionForm>
    </div>
  );
}

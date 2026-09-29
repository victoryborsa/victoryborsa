"use server";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { one, q } from "@/lib/db.ts";
import { checkPassword, clientIp, createSession, destroySession, dummyHash, hashPassword, recordAttempt, requireUser, safeNext, sha256, tooManyAttempts } from "@/lib/auth.ts";
import { isEmail, str, type ActionState } from "@/lib/validate.ts";
import { sendEmail, siteUrl } from "@/lib/email.ts";
import { logEvent } from "@/lib/log.ts";

const homeFor = (role: string) => (role === "admin" ? "/admin" : role === "host" ? "/host" : "/trips");

export async function signInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email", 254).toLowerCase();
  const password = str(fd, "password", 200);
  const ip = await clientIp();
  if (!isEmail(email)) return { error: "Enter the email address you signed up with." };
  if (await tooManyAttempts(email, ip)) {
    await logEvent("warn", "Sign-in", "Too many failed sign-in attempts", { email, ip });
    return { error: "Too many attempts. Wait 15 minutes, or reset your password." };
  }
  const u = await one<{ id: string; password_hash: string; role: string; disabled: boolean }>("SELECT id, password_hash, role, disabled FROM users WHERE lower(email) = $1", [email]);
  // Compare against a dummy hash when the user doesn't exist so response time doesn't reveal which emails have accounts.
  const ok = await checkPassword(password, u?.password_hash || (await dummyHash()));
  await recordAttempt(email, ip, !!(u && ok));
  if (!u || !ok) return { error: "That email and password don't match. Check for typos, or reset your password." };
  if (u.disabled) return { error: "This account has been turned off. Contact us if you think this is a mistake." };
  await createSession(u.id);
  redirect(safeNext(fd.get("next"), homeFor(u.role)));
}

export async function signUpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const name = str(fd, "name", 120), email = str(fd, "email", 254).toLowerCase(), phone = str(fd, "phone", 40), password = str(fd, "password", 200);
  if (!name) return { error: "Add your full name." };
  if (!isEmail(email)) return { error: "Enter a valid email address, like name@example.com." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  const exists = await one("SELECT 1 FROM users WHERE lower(email) = $1", [email]);
  if (exists) return { error: "An account with this email already exists. Sign in instead, or reset your password." };
  const u = await one<{ id: string }>("INSERT INTO users (email, name, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING id", [email, name, phone, await hashPassword(password)]);
  await createSession(u!.id);
  redirect(safeNext(fd.get("next"), "/trips"));
}

export async function signOutAction() {
  await destroySession();
  redirect("/");
}

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email", 254).toLowerCase();
  if (!isEmail(email)) return { error: "Enter a valid email address." };
  const u = await one<{ id: string; name: string }>("SELECT id, name FROM users WHERE lower(email) = $1 AND NOT disabled", [email]);
  if (u) {
    const recent = await one<{ n: number }>("SELECT count(*) AS n FROM password_resets WHERE user_id = $1 AND expires_at > now() + interval '25 minutes'", [u.id]);
    if (!recent || recent.n === 0) {
      const token = crypto.randomBytes(32).toString("base64url");
      await q("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '30 minutes')", [sha256(token), u.id]);
      await sendEmail(email, "Reset your Sevgio password", `Hi ${u.name.split(" ")[0]},\n\nUse this link to choose a new password. It works once and expires in 30 minutes:\n${siteUrl()}/reset/${token}\n\nIf you didn't ask for this, you can ignore this email. Your password hasn't changed.`);
    }
  }
  // Same message either way, so this form can't be used to find out who has an account.
  return { ok: `If an account exists for ${email}, we've sent a link to reset your password. It expires in 30 minutes.` };
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const token = str(fd, "token", 200), password = str(fd, "password", 200), confirm = str(fd, "confirm", 200);
  if (password.length < 8) return { error: "Use at least 8 characters for your new password." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  const r = await one<{ user_id: string }>("UPDATE password_resets SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id", [sha256(token)]);
  if (!r) return { error: "This reset link has expired or was already used. Request a new one." };
  await q("UPDATE users SET password_hash = $2 WHERE id = $1", [r.user_id, await hashPassword(password)]);
  await q("DELETE FROM sessions WHERE user_id = $1", [r.user_id]); // sign out everywhere
  await createSession(r.user_id);
  redirect("/account?reset=1");
}

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser();
  const name = str(fd, "name", 120), phone = str(fd, "phone", 40), email = str(fd, "email", 254).toLowerCase();
  if (!name) return { error: "Your name can't be empty." };
  if (!isEmail(email)) return { error: "Enter a valid email address." };
  const clash = await one("SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2", [email, u.id]);
  if (clash) return { error: "Another account already uses this email." };
  await q("UPDATE users SET name = $2, phone = $3, email = $4 WHERE id = $1", [u.id, name, phone, email]);
  return { ok: "Profile saved." };
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser();
  const current = str(fd, "current", 200), next = str(fd, "password", 200);
  const row = await one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [u.id]);
  if (!row || !(await checkPassword(current, row.password_hash))) return { error: "Your current password isn't right." };
  if (next.length < 8) return { error: "Use at least 8 characters for your new password." };
  await q("UPDATE users SET password_hash = $2 WHERE id = $1", [u.id, await hashPassword(next)]);
  await q("DELETE FROM sessions WHERE user_id = $1", [u.id]);
  await createSession(u.id);
  return { ok: "Password changed. You've been signed out on other devices." };
}


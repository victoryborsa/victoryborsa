"use server";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { one, q } from "@/lib/db.ts";
import { checkPassword, clearFailedSignIns, clientIp, createSession, linkToken, destroySession, dummyHash, hashPassword, recordAttempt, requireUser, safeNext, sha256, tooManyAttempts } from "@/lib/auth.ts";
import { isEmail, str, type ActionState } from "@/lib/validate.ts";
import { sendEmail, siteUrl } from "@/lib/email.ts";
import { logEvent } from "@/lib/log.ts";
import { verificationRequired } from "@/lib/email.ts";
import { checkVerificationCode, sendVerificationCode } from "@/lib/verify.ts";

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
  const next = safeNext(fd.get("next"), homeFor(u.role));
  // Guests who never confirmed their email get a fresh code and must confirm before using the account.
  const unverified = await one<{ id: string; email: string; name: string }>("SELECT id, email, name FROM users WHERE id = $1 AND role = 'customer' AND email_verified_at IS NULL", [u.id]);
  if (unverified && verificationRequired()) {
    await sendVerificationCode(unverified);
    // If the email couldn't be sent, verificationRequired() turns false and the guest carries on.
    if (verificationRequired()) redirect("/verify?next=" + encodeURIComponent(next));
  }
  redirect(next);
}

export async function signUpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const name = str(fd, "name", 120), email = str(fd, "email", 254).toLowerCase(), phone = str(fd, "phone", 40), password = str(fd, "password", 200);
  if (!name) return { error: "Add your full name." };
  if (!isEmail(email)) return { error: "Enter a valid email address, like name@example.com." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  const exists = await one("SELECT 1 FROM users WHERE lower(email) = $1", [email]);
  if (exists) return { error: "An account with this email already exists. Sign in instead, or reset your password." };
  const wantsHost = str(fd, "want", 10) === "host";
  const u = await one<{ id: string }>("INSERT INTO users (email, name, phone, password_hash, host_requested_at) VALUES ($1, $2, $3, $4, $5) RETURNING id", [email, name, phone, await hashPassword(password), wantsHost ? new Date().toISOString() : null]);
  if (wantsHost) {
    await logEvent("warn", "Accounts", `Host request from ${name} (${email})`, {}, u!.id);
    const admins = await q<{ email: string }>("SELECT email FROM users WHERE role = 'admin' AND NOT disabled");
    for (const a of admins) await sendEmail(a.email, `New host request: ${name}`, `${name} (${email}${phone ? `, ${phone}` : ""}) signed up and wants to list their home on Sevgio.\n\nApprove them in Admin → Users & roles: ${siteUrl()}/admin/users?role=requests`);
  }
  await createSession(u!.id);
  await sendVerificationCode({ id: u!.id, email, name });
  const next = safeNext(fd.get("next"), "/trips");
  if (!verificationRequired()) redirect(next);
  await logEvent("info", "Accounts", `New account waiting for email confirmation: ${email}`, {}, u!.id);
  redirect("/verify?next=" + encodeURIComponent(next));
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
      const token = linkToken();
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
  await q("UPDATE users SET password_hash = $2, email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1", [r.user_id, await hashPassword(password)]);
  await q("DELETE FROM sessions WHERE user_id = $1", [r.user_id]); // sign out everywhere
  await clearFailedSignIns(r.user_id);
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
  const changed = email !== u.email.toLowerCase();
  await q(`UPDATE users SET name = $2, phone = $3, email = $4${changed ? ", email_verified_at = NULL" : ""} WHERE id = $1`, [u.id, name, phone, email]);
  if (changed) {
    await sendVerificationCode({ id: u.id, email, name });
    return { ok: "Profile saved. We sent a code to your new email. You'll be asked for it before your next booking." };
  }
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


export async function resendCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  const u = await requireUser(undefined, undefined, { allowUnverified: true });
  if (u.verified) return { ok: "Your email is already confirmed." };
  const r = await sendVerificationCode(u);
  return "error" in r ? { error: r.error } : { ok: `We sent a new code to ${u.email}.` };
}

export async function verifyCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser(undefined, undefined, { allowUnverified: true });
  const code = str(fd, "code", 20);
  if (!/^\d{6}$/.test(code.replace(/\s/g, ""))) return { error: "Enter the 6-digit code from the email." };
  if (!(await checkVerificationCode(u.id, code))) return { error: "That code isn't right or has expired. Check the newest email, or send a new code." };
  await logEvent("info", "Accounts", `Email confirmed: ${u.email}`, {}, u.id);
  redirect(safeNext(fd.get("next"), "/trips"));
}

/** "Wrong email?" on the confirm page: removes the unconfirmed account so the guest can sign up again. */
export async function startOverAction() {
  const u = await requireUser(undefined, undefined, { allowUnverified: true });
  if (u.verified || u.role !== "customer") redirect("/account");
  await destroySession();
  await q("DELETE FROM users WHERE id = $1 AND email_verified_at IS NULL AND role = 'customer' AND NOT EXISTS (SELECT 1 FROM bookings WHERE guest_id = $1)", [u.id]);
  redirect("/signup");
}

/** A guest asks to list their home; admins get an email and approve them in Users & roles. */
export async function requestHostAction(_: ActionState, _fd: FormData): Promise<ActionState> {
  const u = await requireUser(["customer"]);
  const r = await one("UPDATE users SET host_requested_at = now() WHERE id = $1 AND host_requested_at IS NULL RETURNING id", [u.id]);
  if (r) {
    await logEvent("warn", "Accounts", `Host request from ${u.name} (${u.email})`, {}, u.id);
    const admins = await q<{ email: string }>("SELECT email FROM users WHERE role = 'admin' AND NOT disabled");
    for (const a of admins) await sendEmail(a.email, `New host request: ${u.name}`, `${u.name} (${u.email}) wants to list their home on Sevgio.\n\nApprove them in Admin → Users & roles: ${siteUrl()}/admin/users?role=requests`);
  }
  revalidatePath("/account");
  return { ok: "Request sent. We'll email you when your host tools are ready." };
}

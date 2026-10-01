import "server-only";
import crypto from "node:crypto";
import { one, q } from "./db.ts";
import { sha256 } from "./auth.ts";
import { sendEmail } from "./email.ts";

const hashCode = (userId: string, code: string) => sha256(`${userId}:${code}`);

/** Emails a 6-digit code (valid 15 minutes). At most 5 codes per hour per account. */
export async function sendVerificationCode(user: { id: string; email: string; name: string }): Promise<{ ok: true } | { error: string }> {
  const recent = await one<{ n: number }>("SELECT count(*) AS n FROM email_codes WHERE user_id = $1 AND created_at > now() - interval '1 hour'", [user.id]);
  if (recent && recent.n >= 5) return { error: "We've sent several codes already. Check your spam folder, or try again in an hour." };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await q("INSERT INTO email_codes (user_id, code_hash, expires_at) VALUES ($1, $2, now() + interval '15 minutes')", [user.id, hashCode(user.id, code)]);
  const sent = await sendEmail(user.email, `Your Sevgio Stays code: ${code}`, `Hi ${user.name.split(" ")[0]},\n\nYour Sevgio Stays verification code is:\n\n    ${code}\n\nIt expires in 15 minutes. If you didn't ask for it, you can ignore this email.`);
  if (!sent.ok && sent.error !== "not-configured" && sent.error !== "failing") return { error: "We couldn't send the email just now. Please try again in a few minutes, or contact us." };
  return { ok: true };
}

/** Checks the newest unused code. Five wrong tries use it up. */
export async function checkVerificationCode(userId: string, code: string): Promise<boolean> {
  const row = await one<{ id: number; code_hash: string; attempts: number }>(
    "SELECT id, code_hash, attempts FROM email_codes WHERE user_id = $1 AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1",
    [userId],
  );
  if (!row || row.attempts >= 5) return false;
  const given = hashCode(userId, code.replace(/\D/g, ""));
  const ok = given.length === row.code_hash.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(row.code_hash));
  if (!ok) {
    await q("UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1", [row.id]);
    return false;
  }
  await q("UPDATE email_codes SET used_at = now() WHERE id = $1", [row.id]);
  await q("UPDATE users SET email_verified_at = now() WHERE id = $1", [userId]);
  return true;
}

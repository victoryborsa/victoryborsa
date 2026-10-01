import "server-only";
import nodemailer from "nodemailer";
import { logEvent } from "./log.ts";

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
// Settings pasted into Render often carry stray spaces; Gmail shows app passwords as "abcd efgh ijkl mnop".
const env = (k: string) => (process.env[k] || "").trim();
const smtpUser = () => env("SMTP_USER");
const fromAddress = () => env("EMAIL_FROM") || (smtpUser() ? `Sevgio <${smtpUser()}>` : "Sevgio <no-reply@sevgio.com>");

function getTransport() {
  if (!env("SMTP_HOST")) return null;
  transport ??= nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port: Number(env("SMTP_PORT") || 587),
    secure: Number(env("SMTP_PORT")) === 465,
    auth: smtpUser() ? { user: smtpUser(), pass: env("SMTP_PASS").replace(/\s+/g, "") } : undefined,
  });
  return transport;
}

/** True when real emails can go out (otherwise they are only printed to the server logs). */
export const emailReady = () => Boolean(env("SMTP_HOST"));

/** Email codes are only required when they can actually be delivered; otherwise real guests would be locked out.
 *  REQUIRE_EMAIL_VERIFICATION=always forces it on (used by the automated tests). */
export const verificationRequired = () => emailReady() || env("REQUIRE_EMAIL_VERIFICATION") === "always";

export const siteUrl = () => (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Sends a plain-text email. Failures are logged for admins but never break the page. */
export async function sendEmail(to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const t = getTransport();
  const body = text + "\n\n— Sevgio\n" + siteUrl();
  if (!t) {
    console.log(`\n[email not configured] To: ${to}\nSubject: ${subject}\n${body}\n`);
    return { ok: false, error: "not-configured" };
  }
  try {
    await t.sendMail({ from: fromAddress(), to, subject, text: body });
    return { ok: true };
  } catch (e) {
    await logEvent("error", "Email", `Could not send "${subject}" to ${to}`, { error: String(e) });
    return { ok: false, error: String(e) };
  }
}

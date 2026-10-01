import "server-only";
import nodemailer from "nodemailer";
import { logEvent } from "./log.ts";

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
// Settings pasted into Render often carry stray spaces; Gmail shows app passwords as "abcd efgh ijkl mnop".
const env = (k: string) => (process.env[k] || "").trim();
const smtpUser = () => env("SMTP_USER");
const fromAddress = () => env("EMAIL_FROM") || (smtpUser() ? `Sevgio <${smtpUser()}>` : "Sevgio <no-reply@sevgio.com>");

function getTransport() {
  if (!emailReady()) return null;
  transport ??= nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port: Number(env("SMTP_PORT") || 587),
    secure: Number(env("SMTP_PORT")) === 465,
    auth: smtpUser() ? { user: smtpUser(), pass: env("SMTP_PASS").replace(/\s+/g, "") } : undefined,
  });
  return transport;
}

/** True when real emails can go out (otherwise they are only printed to the server logs). */
export const emailReady = () => missingEmailSettings().length === 0;
export const missingEmailSettings = () => ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter(k => !env(k));

// Remember whether the last email went out, so a broken setup (e.g. a wrong password) never locks guests out.
let lastFailure = 0, lastSuccess = 0;
const failingNow = () => lastFailure > lastSuccess && Date.now() - lastFailure < 30 * 60_000;

/** Email codes are only required when they can actually be delivered; otherwise real guests would be locked out.
 *  REQUIRE_EMAIL_VERIFICATION=always forces it on (used by the automated tests). */
export const verificationRequired = () => env("REQUIRE_EMAIL_VERIFICATION") === "always" || (emailReady() && !failingNow());

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
    lastSuccess = Date.now();
    return { ok: true };
  } catch (e) {
    lastFailure = Date.now();
    await logEvent("error", "Email", `Could not send "${subject}" to ${to}`, { error: String(e) });
    return { ok: false, error: String(e) };
  }
}

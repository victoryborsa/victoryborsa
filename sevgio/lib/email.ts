import "server-only";
import nodemailer from "nodemailer";
import { logEvent } from "./log.ts";

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

/** True when real emails can go out (otherwise they are only printed to the server logs). */
export const emailReady = () => Boolean(process.env.SMTP_HOST);

export const siteUrl = () => (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Sends a plain-text email. Failures are logged for admins but never break the page. */
export async function sendEmail(to: string, subject: string, text: string) {
  const t = getTransport();
  const body = text + "\n\n— Sevgio\n" + siteUrl();
  if (!t) {
    console.log(`\n[email not configured] To: ${to}\nSubject: ${subject}\n${body}\n`);
    return;
  }
  try {
    await t.sendMail({ from: process.env.EMAIL_FROM || "Sevgio <no-reply@sevgio.com>", to, subject, text: body });
  } catch (e) {
    await logEvent("error", "Email", `Could not send "${subject}" to ${to}`, { error: String(e) });
  }
}

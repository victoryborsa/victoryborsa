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
    // Give up quickly if the mail server can't be reached, so pages never hang waiting for email.
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
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
/** The same message as simple HTML, so every link is a real, tappable link that no mail app can cut in two. */
function toHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const body = esc(text).replace(/https?:\/\/[^\s<]+/g, url => {
    const isAction = /\/(reset|verify|trips|book|conflicts)\//.test(url);
    return isAction
      ? `<a href="${url}" style="display:inline-block;margin:6px 0;padding:10px 18px;border-radius:8px;background:#FFB612;color:#101820;font-weight:700;text-decoration:none">${/\/reset\//.test(url) ? "Choose a new password" : /\/conflicts\//.test(url) ? "Review conflict" : "Open"}</a><br><span style="font-size:12px;color:#666">or copy this link: <a href="${url}" style="color:#666">${url}</a></span>`
      : `<a href="${url}">${url}</a>`;
  }).replace(/\n/g, "<br>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#101820">${body}</div>`;
}

export async function sendEmail(to: string, subject: string, text: string, opts: { force?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  const t = getTransport();
  const body = text + "\n\nSevgio\n" + siteUrl();
  if (!t) {
    console.log(`\n[email not configured] To: ${to}\nSubject: ${subject}\n${body}\n`);
    return { ok: false, error: "not-configured" };
  }
  // After a failure, don't make every page wait on a broken mail server; retry after 30 minutes (the admin test always tries).
  if (failingNow() && !opts.force) {
    console.log(`\n[email skipped: sending is failing] To: ${to}\nSubject: ${subject}\n${body}\n`);
    return { ok: false, error: "failing" };
  }
  const mail = { from: fromAddress(), to, subject, text: body, html: toHtml(body) };
  try {
    try {
      await t.sendMail(mail);
    } catch (e) {
      // A dropped connection or slow mail server usually works on a second try a moment later.
      if (!isTemporary(e)) throw e;
      await new Promise(r => setTimeout(r, 2000));
      await t.sendMail(mail);
    }
    lastSuccess = Date.now();
    return { ok: true };
  } catch (e) {
    lastFailure = Date.now();
    // Never keep sign-in codes in the admin log.
    await logEvent("error", "Email", `Could not send "${subject.replace(/\d{6}/g, "######")}" to ${to}`, { error: String(e), reason: failureReason(e) });
    return { ok: false, error: String(e) };
  }
}

const TEMPORARY = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNECTION", "ESOCKET", "EDNS", "ECONNREFUSED", "EPIPE"]);
const errCode = (e: unknown) => (e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "");
const errStatus = (e: unknown) => (e && typeof e === "object" && "responseCode" in e ? Number((e as { responseCode: unknown }).responseCode) : 0);
/** Network hiccups and 4xx "try again later" replies from the mail server. */
export const isTemporary = (e: unknown) => TEMPORARY.has(errCode(e)) || (errStatus(e) >= 400 && errStatus(e) < 500);

/** A plain-English reason for the admin log. */
export function failureReason(e: unknown): string {
  const status = errStatus(e);
  if (errCode(e) === "EAUTH" || status === 535 || status === 534) return "The mail server refused the email password. In Render, check SMTP_USER and SMTP_PASS (for Gmail, use an app password).";
  if (status === 550 || status === 553) return "The address was refused. It may be mistyped or the mailbox may not exist.";
  if (status === 552 || /daily (user )?sending limit|quota/i.test(String(e))) return "The mail account hit its sending limit. Sending usually works again within 24 hours.";
  if (isTemporary(e)) return "The mail server could not be reached for a moment. Later emails should go out normally.";
  return "The mail server rejected the email. See the error above.";
}

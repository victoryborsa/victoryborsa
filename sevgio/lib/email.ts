import "server-only";
import nodemailer from "nodemailer";
import { logEvent } from "./log.ts";
import { q } from "./db.ts";

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

/** Sends an email (plain text plus simple HTML). Failures never break the page: the email is logged in Operations and
 *  kept in the outbox, which tries again automatically (see retryOutbox). `queue: false` is for sign-in codes and reset links,
 *  which expire too soon to be worth resending. */
export async function sendEmail(to: string, subject: string, text: string, opts: { force?: boolean; queue?: boolean } = {}): Promise<{ ok: boolean; error?: string; queued?: boolean }> {
  const t = getTransport();
  const body = text + "\n\nSevgio\n" + siteUrl();
  if (!t) {
    console.log(`\n[email not configured] To: ${to}\nSubject: ${subject}\n${body}\n`);
    return { ok: false, error: "not-configured" };
  }
  // After a failure, don't make every page wait on a broken mail server: keep the email for the next retry instead (the admin test always tries).
  if (failingNow() && !opts.force) {
    const queued = opts.queue !== false && await enqueue(to, subject, body, "Sending was paused after a recent failure");
    return { ok: false, error: "failing", queued };
  }
  const r = await deliver(t, to, subject, body);
  if (r.ok) return r;
  const queued = opts.queue !== false && isRetryable(r.cause) && await enqueue(to, subject, body, r.error!);
  await logEvent("error", "Email", `Could not send "${subject.replace(/\d{6}/g, "######")}" to ${to}${queued ? ". It will be retried automatically" : ""}`, { error: r.error, reason: failureReason(r.cause) });
  return { ok: false, error: r.error, queued };
}

async function deliver(t: NonNullable<ReturnType<typeof getTransport>>, to: string, subject: string, body: string): Promise<{ ok: boolean; error?: string; cause?: unknown }> {
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
    return { ok: false, error: String(e), cause: e };
  }
}

/** A refused address won't start working by itself; everything else (network, password, sending limit) is worth retrying. */
const isRetryable = (e: unknown) => ![550, 553].includes(errStatus(e));

async function enqueue(to: string, subject: string, body: string, error: string): Promise<boolean> {
  try {
    await q("INSERT INTO email_outbox (to_addr, subject, body, last_error) VALUES ($1, $2, $3, $4)", [to, subject, body, error.slice(0, 500)]);
    return true;
  } catch (e) {
    console.error("[email outbox failed]", e);
    return false;
  }
}

/** Retry waits: 10 minutes, 30 minutes, 2 hours, 6 hours, 24 hours, then the email is marked failed for an admin to resend. */
export const RETRY_MINUTES = [10, 30, 120, 360, 1440];

/** Sends waiting emails that are due (or the one given by id, now). Runs with the hourly jobs and from Operations → Retry now. */
export async function retryOutbox(onlyId?: number): Promise<{ sent: number; failed: number; waiting: number }> {
  const t = getTransport();
  if (!t) return { sent: 0, failed: 0, waiting: 0 };
  const due = await q<{ id: number; to_addr: string; subject: string; body: string; attempts: number }>(
    onlyId ? "SELECT id, to_addr, subject, body, attempts FROM email_outbox WHERE id = $1 AND status <> 'sent'"
      : "SELECT id, to_addr, subject, body, attempts FROM email_outbox WHERE status = 'waiting' AND next_try_at <= now() ORDER BY id LIMIT 50",
    onlyId ? [onlyId] : []);
  let sent = 0, failed = 0, waiting = 0;
  for (const m of due) {
    const r = await deliver(t, m.to_addr, m.subject, m.body);
    if (r.ok) {
      sent++;
      await q("UPDATE email_outbox SET status = 'sent', sent_at = now(), attempts = attempts + 1 WHERE id = $1", [m.id]);
      continue;
    }
    const wait = RETRY_MINUTES[m.attempts];
    if (wait && isRetryable(r.cause)) {
      waiting++;
      await q("UPDATE email_outbox SET attempts = attempts + 1, last_error = $2, next_try_at = now() + make_interval(mins => $3), status = 'waiting' WHERE id = $1", [m.id, r.error!.slice(0, 500), wait]);
    } else {
      failed++;
      await q("UPDATE email_outbox SET attempts = attempts + 1, last_error = $2, status = 'failed' WHERE id = $1", [m.id, r.error!.slice(0, 500)]);
      await logEvent("error", "Email", `Gave up sending "${m.subject.replace(/\d{6}/g, "######")}" to ${m.to_addr} after ${m.attempts + 1} tries. Resend it from Operations.`, { error: r.error, reason: failureReason(r.cause) });
    }
  }
  return { sent, failed, waiting };
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

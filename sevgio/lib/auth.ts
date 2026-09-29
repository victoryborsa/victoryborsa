import "server-only";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { one, q } from "./db.ts";
import type { Role } from "./constants.ts";

export type User = { id: string; email: string; name: string; phone: string; role: Role; created_at: string };

const COOKIE = "sevgio_session";
const SESSION_DAYS = 30;

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
let dummy: Promise<string> | null = null;
/** A real hash to compare against when an email has no account, so timing doesn't reveal which emails exist. */
export const dummyHash = () => (dummy ??= bcrypt.hash("not-a-real-password", 12));

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const h = await headers();
  await q("INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES ($1, $2, now() + $3::interval, $4)", [sha256(token), userId, `${SESSION_DAYS} days`, (h.get("user-agent") || "").slice(0, 300)]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await q("DELETE FROM sessions WHERE id = $1", [sha256(token)]);
  jar.delete(COOKIE);
}

/** The signed-in user for this request, or null. Cached so each request hits the database once. */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return one<User>(
    `SELECT u.id, u.email, u.name, u.phone, u.role, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now() AND NOT u.disabled`,
    [sha256(token)],
  );
});

/** Use at the top of every protected page and server action. Redirects signed-out visitors and blocks wrong roles. */
export async function requireUser(roles?: Role[], next?: string): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/signin" + (next ? "?next=" + encodeURIComponent(next) : ""));
  if (roles && !roles.includes(u.role)) redirect("/no-access");
  return u;
}

/** Rate limit: after 5 failed sign-ins for an email (or 20 from one IP) in 15 minutes, wait. */
export async function tooManyAttempts(email: string, ip: string): Promise<boolean> {
  const r = await one<{ by_email: number; by_ip: number }>(
    `SELECT count(*) FILTER (WHERE lower(email) = lower($1)) AS by_email, count(*) FILTER (WHERE ip = $2 AND $2 <> '') AS by_ip
     FROM login_attempts WHERE NOT success AND at > now() - interval '15 minutes'`,
    [email, ip],
  );
  return !!r && (r.by_email >= 5 || r.by_ip >= 20);
}

export async function recordAttempt(email: string, ip: string, success: boolean) {
  await q("INSERT INTO login_attempts (email, ip, success) VALUES ($1, $2, $3)", [email.slice(0, 254), ip, success]);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") || h.get("x-real-ip") || "").split(",")[0].trim().slice(0, 64);
}

/** Only allow redirects back into this site after sign-in. */
export function safeNext(next: unknown, fallback = "/"): string {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}

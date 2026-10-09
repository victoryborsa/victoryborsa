import "server-only";
import { one, q } from "./db.ts";
import type { User } from "./auth.ts";
import { sendEmail, siteUrl } from "./email.ts";
import { logEvent } from "./log.ts";

/** One conversation per Sevgio.com reservation, between the guest and the host / admins. */
export type ConvBooking = { id: string; code: string; guest_id: string; guest_name: string; guest_email: string; title: string; host_id: string; host_email: string;
  check_in: string; check_out: string; status: string };
export type ConvMessage = { id: string; from_guest: boolean; body: string; created_at: string; read_at: string | null; email_status: string; sender_name: string | null; client_id: string | null };
export type Side = "guest" | "staff";

const BOOKING = `SELECT b.id, b.code, b.guest_id, b.guest_name, g.email AS guest_email, p.title, p.host_id, h.email AS host_email, b.check_in::text, b.check_out::text, b.status
  FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.guest_id JOIN users h ON h.id = p.host_id`;

/** The reservation and which side this person is on, or null when they may not see it (only the guest, the listing's host and admins may). */
export async function conversationAccess(u: User, by: { code?: string; id?: string }): Promise<{ b: ConvBooking; side: Side } | null> {
  const b = by.id
    ? /^[0-9a-f-]{36}$/i.test(by.id) ? await one<ConvBooking>(`${BOOKING} WHERE b.id = $1`, [by.id]) : null
    : await one<ConvBooking>(`${BOOKING} WHERE b.code = $1`, [(by.code || "").toUpperCase()]);
  if (!b) return null;
  if (u.role === "admin" || b.host_id === u.id) return { b, side: "staff" };
  if (b.guest_id === u.id) return { b, side: "guest" };
  return null;
}

export async function messagesFor(bookingId: string): Promise<ConvMessage[]> {
  return q<ConvMessage>(
    `SELECT m.id, m.from_guest, m.body, m.created_at, m.read_at, m.email_status, m.client_id, u.name AS sender_name
     FROM booking_messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.booking_id = $1 ORDER BY m.created_at, m.id`, [bookingId]);
}

/** Opening the conversation marks what the other side wrote as read. */
export async function markRead(bookingId: string, side: Side) {
  await q("UPDATE booking_messages SET read_at = now() WHERE booking_id = $1 AND from_guest = $2 AND read_at IS NULL", [bookingId, side === "staff"]);
}

/** Unread guest messages per booking, for the badge on the message icon. */
export async function unreadFromGuests(bookingIds: string[]): Promise<Map<string, number>> {
  if (!bookingIds.length) return new Map();
  const rows = await q<{ booking_id: string; n: number }>(
    "SELECT booking_id, count(*)::int AS n FROM booking_messages WHERE booking_id = ANY($1) AND from_guest AND read_at IS NULL GROUP BY booking_id", [bookingIds]);
  return new Map(rows.map(r => [r.booking_id, r.n]));
}

export type SendResult = { ok: true; message: ConvMessage } | { ok: false; error: string };

/**
 * Saves a message and emails the other side a notice. The message counts as Sent once it is saved (the other side sees it
 * on Sevgio); the email's outcome is stored separately, since "sent" from a mail server only means it was accepted.
 */
export async function postMessage(u: User, bookingId: string, body: string, clientId: string): Promise<SendResult> {
  const access = await conversationAccess(u, { id: bookingId });
  if (!access) return { ok: false, error: "You can't message about this reservation." };
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) return { ok: false, error: "Write a message before sending." };
  if (text.length > 4000) return { ok: false, error: "Messages can be up to 4,000 characters." };
  const { b, side } = access;
  const cid = /^[A-Za-z0-9-]{8,64}$/.test(clientId) ? clientId : null;
  const recent = await one<{ n: number }>("SELECT count(*)::int AS n FROM booking_messages WHERE sender_id = $1 AND created_at > now() - interval '10 minutes'", [u.id]);
  if (recent && recent.n >= 30) return { ok: false, error: "You've sent many messages in a few minutes. Please wait a moment." };
  const saved = await one<ConvMessage>(
    `INSERT INTO booking_messages (booking_id, sender_id, from_guest, body, client_id) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (booking_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
     RETURNING id, from_guest, body, created_at, read_at, email_status, client_id, NULL::text AS sender_name`,
    [b.id, u.id, side === "guest", text, cid]);
  // The same Send arriving twice: return the copy already saved.
  if (!saved) {
    const dup = await one<ConvMessage>("SELECT id, from_guest, body, created_at, read_at, email_status, client_id, NULL::text AS sender_name FROM booking_messages WHERE booking_id = $1 AND client_id = $2", [b.id, cid]);
    return dup ? { ok: true, message: dup } : { ok: false, error: "The message couldn't be saved. Please try again." };
  }
  const link = `${siteUrl()}/trips/${b.code}/messages`;
  const subject = `New message about booking ${b.code}: ${b.title}`;
  const quote = text.length > 1500 ? text.slice(0, 1500) + "…" : text;
  const to = side === "guest"
    ? [b.host_email, ...((await q<{ email: string }>("SELECT email FROM users WHERE role = 'admin' AND NOT disabled AND lower(email) <> lower($1)", [b.host_email])).map(r => r.email))]
    : [b.guest_email];
  const intro = side === "guest" ? `${b.guest_name} wrote about booking ${b.code} (${b.title}):` : `Your host wrote about your booking ${b.code} (${b.title}):`;
  const results = await Promise.all(to.map(addr => sendEmail(addr, subject, `${intro}\n\n${quote}\n\nRead and reply: ${link}`)));
  const status = results.every(r => r.ok) ? "sent" : results.some(r => r.error === "not-configured") ? "off" : results.some(r => r.queued) ? "queued" : "failed";
  await q("UPDATE booking_messages SET email_status = $2 WHERE id = $1", [saved.id, status]);
  await logEvent("info", "Messages", `${side === "guest" ? "Guest" : "Host"} message on ${b.code}`, { booking: b.code, email: status }, u.id);
  return { ok: true, message: { ...saved, email_status: status, sender_name: u.name } };
}

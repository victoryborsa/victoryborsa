import "server-only";
import type pg from "pg";
import { one, q, tx } from "./db.ts";
import type { Booking } from "./bookings.ts";
import { getSettings, type Settings } from "./settings.ts";
import { METHOD_LABEL } from "./payment-rules.ts";
import { stripe } from "./payments.ts";
import { sendEmail, siteUrl } from "./email.ts";
import { logEvent } from "./log.ts";
import { fmtDate } from "./dates.ts";
import { money } from "./money.ts";
import { partyLabel } from "./party.ts";

type Info = Booking & { title: string; host_id: string; host_email: string; guest_email: string };

export async function bookingInfo(id: string) {
  return one<Info>(
    `SELECT b.*, p.title, p.host_id, h.email AS host_email, g.email AS guest_email
     FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users h ON h.id = p.host_id JOIN users g ON g.id = b.guest_id WHERE b.id = $1`,
    [id],
  );
}

const dates = (b: Booking) => `${fmtDate(b.check_in)} – ${fmtDate(b.check_out)}`;
const deadlineText = (b: Booking) =>
  b.payment_deadline ? new Date(b.payment_deadline).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET" : "";

/** How to pay by Zelle / Venmo, as plain text (for email) — the trip page shows the same details. */
export function manualInstructions(b: Booking, s: Settings): string {
  const amount = money(b.due_now_cents);
  const lines: string[] = [];
  if (b.payment_method === "zelle") lines.push(`Send ${amount} by Zelle to ${s.zelle_to}.`);
  if (b.payment_method === "venmo") lines.push(`Send ${amount} by Venmo to ${s.venmo_handle}.`);
  if (b.payment_method === "cash") {
    lines.push(`Send a ${amount} deposit by ${[s.zelle_to && `Zelle to ${s.zelle_to}`, s.venmo_handle && `Venmo to ${s.venmo_handle}`].filter(Boolean).join(" or ")}.`);
    lines.push(`Pay the remaining ${money(b.total_cents - b.due_now_cents)} in cash when you arrive.`);
  }
  lines.push(`Put your booking reference ${b.code} in the payment note.`);
  if (b.payment_deadline) lines.push(`Please pay by ${deadlineText(b)}. If we haven't received it by then, the booking is cancelled automatically and the dates are released.`);
  return lines.join("\n");
}

/** Emails after a booking is created or accepted, depending on whether payment is still needed. */
export async function notifyBooking(b: Info) {
  const s = await getSettings();
  const first = b.guest_name.split(" ")[0];
  const link = `${siteUrl()}/trips/${b.code}`;
  if (b.status === "confirmed") {
    const paid = b.paid_cents > 0 ? `\nPaid: ${money(b.paid_cents)}${b.payment_status === "processing" ? " (bank transfer processing)" : ""}` : "";
    const balance = b.payment_method === "cash" ? `\nDue in cash at arrival: ${money(b.total_cents - b.paid_cents)}` : "";
    await sendEmail(b.guest_email, `Booking confirmed: ${b.title}`, `Hi ${first},\n\nYour stay at ${b.title} is confirmed.\n\nReference: ${b.code}\nDates: ${dates(b)}\nGuests: ${partyLabel(b)}\nTotal: ${money(b.total_cents + b.card_fee_cents)}${paid}${balance}\n\nView your booking and arrival details: ${link}`);
    await sendEmail(b.host_email, `Confirmed booking: ${b.title}, ${dates(b)}`, `${b.guest_name} is booked at ${b.title} for ${dates(b)} (${partyLabel(b)}).\nPhone: ${b.guest_phone}\n${b.payment_method ? `Payment: ${METHOD_LABEL[b.payment_method]}, ${money(b.paid_cents)} received\n` : ""}${b.message ? "\nMessage: " + b.message + "\n" : ""}\nDetails: ${siteUrl()}/host/bookings`);
  } else if (b.status === "awaiting_payment") {
    const how = b.payment_method === "card" || b.payment_method === "ach"
      ? `Complete your payment here: ${link}\nPlease pay by ${deadlineText(b)}, or the dates are released.`
      : manualInstructions(b, s);
    await sendEmail(b.guest_email, `Complete your booking: ${b.title}`, `Hi ${first},\n\nYour dates at ${b.title} (${dates(b)}) are held for you. To confirm the booking:\n\n${how}\n\nReference: ${b.code}\nView your booking: ${link}`);
    await sendEmail(b.host_email, `New booking awaiting payment: ${b.title}, ${dates(b)}`, `${b.guest_name} booked ${b.title} for ${dates(b)} and chose to pay by ${b.payment_method ? METHOD_LABEL[b.payment_method] : "—"}.\n${b.payment_method === "card" || b.payment_method === "ach" ? "It confirms automatically once paid." : `When you receive ${money(b.due_now_cents)}, click "Mark payment received" in ${siteUrl()}/host/bookings`}`);
  } else if (b.status === "pending") {
    await sendEmail(b.guest_email, `Request sent: ${b.title}`, `Hi ${first},\n\nWe've sent your request to the host. Your dates are held while they decide, usually within a few hours. You'll get another email when they reply${b.payment_method ? ", with how to pay" : ""}.\n\nReference: ${b.code}\nDates: ${dates(b)}\n\nView your request: ${link}`);
    await sendEmail(b.host_email, `Booking request: ${b.title}, ${dates(b)}`, `${b.guest_name} would like to stay at ${b.title} for ${dates(b)} (${partyLabel(b)}).\n\nMessage: ${b.message}\n\nAccept or decline within 48 hours: ${siteUrl()}/host/bookings`);
  }
}

/** Starts a Stripe Checkout for what's due now. The dates stay held until the deadline. */
export async function startCheckout(b: Info): Promise<string> {
  const s = stripe();
  const method = b.payment_method === "ach" ? "us_bank_account" : "card";
  // Stripe sessions must last 30 min–24 h.
  const deadline = b.payment_deadline ? new Date(b.payment_deadline).getTime() : Date.now() + 3600_000;
  const expires = Math.floor(Math.min(Math.max(deadline, Date.now() + 31 * 60_000), Date.now() + 23.5 * 3600_000) / 1000);
  const session = await s.checkout.sessions.create({
    mode: "payment",
    payment_method_types: [method],
    customer_email: b.guest_email,
    client_reference_id: b.id,
    metadata: { booking_id: b.id, code: b.code },
    payment_intent_data: { metadata: { booking_id: b.id, code: b.code }, description: `${b.code} · ${b.title}` },
    line_items: [
      { quantity: 1, price_data: { currency: "usd", unit_amount: b.total_cents, product_data: { name: `${b.title}`, description: `${dates(b)} · ${b.nights} night${b.nights === 1 ? "" : "s"} · ${b.code}` } } },
      ...(b.card_fee_cents > 0 ? [{ quantity: 1, price_data: { currency: "usd", unit_amount: b.card_fee_cents, product_data: { name: "Card processing fee" } } }] : []),
    ],
    expires_at: expires,
    success_url: `${siteUrl()}/trips/${b.code}?paid=1`,
    cancel_url: `${siteUrl()}/trips/${b.code}`,
  });
  await q("INSERT INTO payments (booking_id, method, amount_cents, status, stripe_session) VALUES ($1, $2, $3, 'pending', $4)", [b.id, b.payment_method, b.due_now_cents, session.id]);
  return session.url!;
}

/**
 * Records money received and confirms the booking. Used by the Stripe webhook and by "Mark payment received".
 * `grossCents` is what the guest paid; the card processing fee isn't counted toward the booking total.
 * Safe to call twice for the same Stripe session. If the hold had already expired and someone else took
 * the dates, the booking stays expired and admins are told to refund.
 */
export async function recordPayment(bookingId: string, grossCents: number, opts: { method: string; processing?: boolean; stripeSession?: string; stripeIntent?: string; recordedBy?: string; note?: string }) {
  const result = await tx(async c => {
    const b = await one<Booking>("SELECT * FROM bookings WHERE id = $1 FOR UPDATE", [bookingId], c);
    if (!b) return { ok: false as const, reason: "missing" as const };
    const toward = Math.max(0, opts.method === "card" ? grossCents - b.card_fee_cents : grossCents);
    let add = toward;
    const newStatus = opts.processing ? "processing" : "succeeded";
    if (opts.stripeSession) {
      const prev = await one<{ status: string }>("SELECT status FROM payments WHERE stripe_session = $1 FOR UPDATE", [opts.stripeSession], c);
      if (prev?.status === "succeeded" || (prev?.status === "processing" && opts.processing)) return { ok: true as const, changed: false, b };
      if (prev) await q("UPDATE payments SET status = $2, stripe_intent = coalesce($3, stripe_intent), updated_at = now() WHERE stripe_session = $1", [opts.stripeSession, newStatus, opts.stripeIntent ?? null], c);
      else await q("INSERT INTO payments (booking_id, method, amount_cents, status, stripe_session, stripe_intent) VALUES ($1, $2, $3, $4, $5, $6)", [bookingId, opts.method, toward, newStatus, opts.stripeSession, opts.stripeIntent ?? null], c);
      if (prev?.status === "processing") add = 0; // a bank transfer we already counted has now cleared
    } else {
      await q("INSERT INTO payments (booking_id, method, amount_cents, status, recorded_by, note) VALUES ($1, $2, $3, 'succeeded', $4, $5)", [bookingId, opts.method, toward, opts.recordedBy ?? null, opts.note ?? ""], c);
    }
    const paid = b.paid_cents + add;
    const payStatus = opts.processing ? "processing" : paid < b.total_cents ? "deposit_paid" : "paid";
    await c.query("SAVEPOINT confirm");
    try {
      await q(`UPDATE bookings SET paid_cents = $2, payment_status = $3, status = CASE WHEN status IN ('awaiting_payment', 'expired') THEN 'confirmed' ELSE status END, updated_at = now() WHERE id = $1`, [bookingId, paid, payStatus], c);
    } catch (e) {
      if ((e as pg.DatabaseError).code !== "23P01") throw e;
      await c.query("ROLLBACK TO SAVEPOINT confirm");
      await q("UPDATE bookings SET paid_cents = $2, payment_status = $3, updated_at = now() WHERE id = $1", [bookingId, paid, payStatus], c);
      return { ok: false as const, reason: "taken" as const, b };
    }
    return { ok: true as const, changed: true, b, nowConfirmed: b.status !== "confirmed" };
  });
  if (!result.ok && result.reason === "taken") {
    await logEvent("error", "Payment", `Payment received for ${result.b.code} after its hold expired, and the dates were taken. Refund the guest.`, { booking: bookingId, amount: grossCents });
  }
  if (result.ok && result.changed) {
    await logEvent("info", "Payment", `${money(grossCents)} received for ${result.b.code} (${opts.method})${opts.processing ? ", bank transfer processing" : ""}`, {}, opts.recordedBy ?? null);
    if (result.nowConfirmed) {
      const info = await bookingInfo(bookingId);
      if (info?.status === "confirmed") await notifyBooking(info);
    }
  }
  return result;
}

/** A bank transfer that bounced. The booking stays confirmed; the host decides what to do. */
export async function paymentFailed(stripeSession: string, reason: string) {
  const p = await one<{ booking_id: string }>("UPDATE payments SET status = 'failed', note = $2, updated_at = now() WHERE stripe_session = $1 RETURNING booking_id", [stripeSession, reason.slice(0, 300)]);
  if (!p) return;
  const b = await bookingInfo(p.booking_id);
  if (!b) return;
  await q("UPDATE bookings SET payment_status = 'failed', paid_cents = greatest(0, paid_cents - $2), updated_at = now() WHERE id = $1", [b.id, b.due_now_cents]);
  await logEvent("error", "Payment", `Bank transfer failed for ${b.code}: ${reason}`, { booking: b.id });
  await sendEmail(b.host_email, `Payment failed: ${b.code}`, `The bank transfer for ${b.guest_name}'s booking ${b.code} (${b.title}, ${dates(b)}) failed: ${reason}.\n\nContact the guest to arrange payment, or cancel the booking: ${siteUrl()}/host/bookings`);
  await sendEmail(b.guest_email, `Your payment didn't go through: ${b.code}`, `Your bank transfer for ${b.title} (${dates(b)}) didn't go through. Please contact us to arrange payment so we can keep your booking: ${siteUrl()}/contact`);
}

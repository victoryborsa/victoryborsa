import "server-only";
import type pg from "pg";
import { one, q, tx } from "./db.ts";
import type { Booking } from "./bookings.ts";
import { getSettings, type Settings } from "./settings.ts";
import { METHOD_LABEL } from "./payment-rules.ts";
import { forListing, stripe } from "./payments.ts";
import { sendEmail, siteUrl } from "./email.ts";
import { logEvent } from "./log.ts";
import { fmtDate, fmtWhen } from "./dates.ts";
import { money } from "./money.ts";
import { extrasOf, partyLabel } from "./party.ts";
import { KEEP_REFERENCE } from "./booking-ref.ts";
import { paymentLater, paymentText } from "./statuses.ts";

type Info = Booking & { title: string; host_id: string; host_email: string; guest_email: string; owner_zelle: string; owner_venmo: string };

export async function bookingInfo(id: string) {
  return one<Info>(
    `SELECT b.*, p.title, p.host_id, p.owner_zelle, p.owner_venmo, h.email AS host_email, g.email AS guest_email
     FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users h ON h.id = p.host_id JOIN users g ON g.id = b.guest_id WHERE b.id = $1`,
    [id],
  );
}

const dates = (b: Booking) => `${fmtDate(b.check_in)} - ${fmtDate(b.check_out)}`;
const deadlineText = (b: Booking) =>
  b.payment_deadline ? fmtWhen(b.payment_deadline) + " ET" : "";

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

/** The booking's key facts as they appear in every guest email, led by the reference. */
export function guestSummary(b: Booking & { title: string }): string {
  return [
    `Booking reference: ${b.code}`,
    `Guest name: ${b.guest_name}`,
    `Property: ${b.title}`,
    `Check-in: ${fmtDate(b.check_in)}`,
    `Check-out: ${fmtDate(b.check_out)} (${b.nights} night${b.nights === 1 ? "" : "s"})`,
    `Guests: ${partyLabel(b)}`,
    `Total price: ${money(b.total_cents + b.card_fee_cents)}`,
    `Payment status: ${paymentText(b)}`,
    paymentLater(b),
  ].filter(Boolean).join("\n") + `\n\n${KEEP_REFERENCE}`;
}

/** Emails after a booking is created or accepted, depending on whether payment is still needed. */
/** Admins get a copy of every host notice, so nothing is missed when the host is someone else. */
async function toHostAndAdmins(b: Info, subject: string, text: string) {
  await sendEmail(b.host_email, subject, text);
  const admins = await q<{ email: string }>("SELECT email FROM users WHERE role = 'admin' AND lower(email) <> lower($1)", [b.host_email]);
  for (const a of admins) await sendEmail(a.email, subject, text);
}

export async function notifyBooking(b: Info) {
  const s = forListing(await getSettings(), b);
  const extras = extrasOf(b).length ? `\nExtras: ${extrasOf(b).map(x => `${x.name}${x.qty > 1 && x.total ? ` × ${x.qty}` : ""} (${x.total ? money(x.total) : "free"})${x.details ? `: ${x.details}` : ""}`).join(", ")}` : "";
  const deposit = b.security_deposit_cents > 0 ? `\nRefundable security deposit: ${money(b.security_deposit_cents)} (collected separately by your host, returned after check-out)` : "";
  const first = b.guest_name.split(" ")[0];
  const link = `${siteUrl()}/trips/${b.code}`;
  if (b.status === "confirmed") {
    const paid = b.paid_cents > 0 ? `\nPaid: ${money(b.paid_cents)}${b.payment_status === "processing" ? " (bank transfer processing)" : ""}` : "";
    const balance = b.payment_method === "cash" ? `\nDue in cash at arrival: ${money(b.total_cents - b.paid_cents)}` : "";
    await sendEmail(b.guest_email, `Booking confirmed ${b.code}: ${b.title}`, `Hi ${first},\n\nYour stay at ${b.title} is confirmed.\n\n${guestSummary(b)}${extras ? "\n" + extras : ""}${paid}${balance}${deposit}\n\nView your booking and arrival details: ${link}`);
    await toHostAndAdmins(b, `Confirmed booking ${b.code}: ${b.title}, ${dates(b)}`, `${b.guest_name} is booked at ${b.title} for ${dates(b)} (${partyLabel(b)}).${extras}${b.security_deposit_cents > 0 ? `\nCollect the ${money(b.security_deposit_cents)} security deposit.` : ""}\nPhone: ${b.guest_phone}\n${b.payment_method ? `Payment: ${METHOD_LABEL[b.payment_method]}, ${money(b.paid_cents)} received\n` : ""}${b.message ? "\nMessage: " + b.message + "\n" : ""}\nReference: ${b.code}\nDetails: ${siteUrl()}/trips/${b.code}`);
  } else if (b.status === "awaiting_payment") {
    const how = b.payment_method === "card" || b.payment_method === "ach"
      ? `Complete your payment here: ${link}\nPlease pay by ${deadlineText(b)}, or the dates are released.`
      : manualInstructions(b, s);
    await sendEmail(b.guest_email, `Complete your booking ${b.code}: ${b.title}`, `Hi ${first},\n\nYour dates at ${b.title} (${dates(b)}) are held for you. To confirm the booking:\n\n${how}\n\n${guestSummary(b)}\n\nView your booking: ${link}`);
    await toHostAndAdmins(b, `New booking awaiting payment ${b.code}: ${b.title}, ${dates(b)}`, `${b.guest_name} booked ${b.title} for ${dates(b)} and chose to pay by ${b.payment_method ? METHOD_LABEL[b.payment_method] : "not chosen"}.\n${b.payment_method === "card" || b.payment_method === "ach" ? "It confirms automatically once paid." : `When you receive ${money(b.due_now_cents)}, click "Mark payment received" in ${siteUrl()}/host/bookings`}`);
  } else if (b.status === "pending") {
    await sendEmail(b.guest_email, `Request sent ${b.code}: ${b.title}`, `Hi ${first},\n\nWe've sent your request to the host. Your dates are held while they decide, usually within a few hours. You'll get another email when they reply${b.payment_method ? ", with how to pay" : ""}.\n\n${guestSummary(b)}\n\nView your request: ${link}`);
    await toHostAndAdmins(b, `Booking request ${b.code}: ${b.title}, ${dates(b)}`, `${b.guest_name} would like to stay at ${b.title} for ${dates(b)} (${partyLabel(b)}).${extras}\n\nMessage: ${b.message}\n\nAccept or decline within 48 hours: ${siteUrl()}/host/bookings`);
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
    const info = await bookingInfo(bookingId);
    if (result.nowConfirmed) {
      if (info?.status === "confirmed") await notifyBooking(info);
    } else if (info && !opts.processing) {
      await emailPaymentReceived(info, grossCents);
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

/** Confirmation for a reservation the host entered by hand: nothing paid yet, the guest pays at the property. */
export async function emailManualConfirmation(b: Info) {
  const first = b.guest_name.split(" ")[0] || "there";
  const lines = [
    `Booking reference: ${b.code}`,
    `Guest name: ${b.guest_name}`,
    `Property: ${b.title}`,
    `Check-in: ${fmtDate(b.check_in)}`,
    `Check-out: ${fmtDate(b.check_out)} (${b.nights} night${b.nights === 1 ? "" : "s"})`,
    `Total: ${money(b.total_cents)}`,
    `Amount paid: ${money(b.paid_cents)}`,
    `Balance due: ${money(b.total_cents - b.paid_cents)}`,
  ].join("\n");
  return sendEmail(b.guest_email, `Reservation confirmed ${b.code}: ${b.title}`,
    `Hi ${first},\n\nYour reservation at ${b.title} is confirmed.\n\n${lines}\n\nPayment is due at the property unless otherwise arranged.\n\n${KEEP_REFERENCE}\n\n`
    + `See your reservation and arrival details online: ${siteUrl()}/trips/${b.code}\n(Sign in with this email address. The first time, choose "Forgot password" to set one.)`);
}

/** Tells the guest a payment was recorded (when the booking was already confirmed, so no confirmation email goes out). */
export async function emailPaymentReceived(b: Info, amountCents: number) {
  const first = b.guest_name.split(" ")[0] || "there";
  const balance = Math.max(0, b.total_cents - b.paid_cents);
  return sendEmail(b.guest_email, `Payment received ${b.code}: ${b.title}`,
    `Hi ${first},\n\nWe received your payment of ${money(amountCents)} for ${b.title} (${dates(b)}).\n\n`
    + `Booking reference: ${b.code}\nTotal: ${money(b.total_cents)}\nPaid so far: ${money(b.paid_cents)}\n${balance > 0 ? `Balance due: ${money(balance)}` : "Paid in full. Thank you!"}\n\n`
    + `See your booking: ${siteUrl()}/trips/${b.code}`);
}

/** Tells the guest what changed after an admin edits their reservation. */
export async function emailReservationUpdate(b: Info, changes: string[]) {
  const first = b.guest_name.split(" ")[0] || "there";
  return sendEmail(b.guest_email, `Reservation updated ${b.code}: ${b.title}`,
    `Hi ${first},\n\nYour reservation at ${b.title} was updated.\n\nWhat changed:\n${changes.map(c => `- ${c}`).join("\n")}\n\n${guestSummary(b)}\n\n`
    + `See your reservation: ${siteUrl()}/trips/${b.code}\nIf anything looks wrong, reply to this email or contact us: ${siteUrl()}/contact`);
}

type ArrivalInfo = Info & { address: string; city: string; arrival_instructions: string; check_in_time: string; check_out_time: string; host_name: string; host_phone: string };

/** Check-in instructions, emailed automatically two days before arrival (or straight away for a booking made closer than that). */
export async function sendCheckInInstructions(): Promise<{ sent: number }> {
  const rows = await q<ArrivalInfo>(
    `SELECT b.*, p.title, p.host_id, p.owner_zelle, p.owner_venmo, p.address, p.city, p.arrival_instructions, p.check_in_time, p.check_out_time,
            h.email AS host_email, h.name AS host_name, h.phone AS host_phone, g.email AS guest_email
     FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users h ON h.id = p.host_id JOIN users g ON g.id = b.guest_id
     WHERE b.status = 'confirmed' AND b.checkin_email_at IS NULL
       AND b.check_in BETWEEN (now() AT TIME ZONE 'America/New_York')::date AND (now() AT TIME ZONE 'America/New_York')::date + 2
     LIMIT 100`);
  let sent = 0;
  for (const b of rows) {
    // Claim it first so two servers never send it twice.
    const claimed = await one("UPDATE bookings SET checkin_email_at = now() WHERE id = $1 AND checkin_email_at IS NULL RETURNING id", [b.id]);
    if (!claimed) continue;
    const r = await sendEmail(b.guest_email, `Check-in instructions ${b.code}: ${b.title}`, checkInText(b));
    if (r.ok || r.queued) sent++;
    else await q("UPDATE bookings SET checkin_email_at = NULL WHERE id = $1", [b.id]); // not configured: try again next hour
  }
  return { sent };
}

export function checkInText(b: ArrivalInfo): string {
  const first = b.guest_name.split(" ")[0] || "there";
  const later = paymentLater(b);
  return [
    `Hi ${first},`, "",
    `Your stay at ${b.title} starts ${fmtDate(b.check_in)}. Here is everything you need to arrive.`, "",
    `Booking reference: ${b.code}`,
    `Address: ${b.address || `${b.city} (your host will send the exact address)`}`,
    `Check-in: ${fmtDate(b.check_in)}, after ${b.check_in_time}`,
    `Check-out: ${fmtDate(b.check_out)}, by ${b.check_out_time}`,
    ...(b.arrival_instructions ? ["", "How to get in:", b.arrival_instructions] : []),
    "", `Your host: ${b.host_name}${b.host_phone ? `, ${b.host_phone}` : ""}, ${b.host_email}`,
    ...(later ? ["", later] : []),
    "", `Your booking online: ${siteUrl()}/trips/${b.code}`,
  ].join("\n");
}

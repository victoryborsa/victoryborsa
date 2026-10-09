// The one place reservation and payment statuses get their names. Every list, calendar, email and guest page uses these,
// so a stay never reads "Unconfirmed" just because a calendar link left out the guest's name.
import { money } from "./money.ts";

const fmtShort = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
import { stayPhase, type StayClock } from "./booking-ref.ts";

export type Tone = "ok" | "warn" | "danger" | "neutral";
export type ResStatusKey = "confirmed" | "pending" | "block" | "review" | "cancelled" | "checked_in" | "checked_out";

export const RES_STATUS: Record<ResStatusKey, { label: string; tone: Tone }> = {
  confirmed: { label: "Confirmed", tone: "ok" },
  pending: { label: "Pending", tone: "warn" },
  block: { label: "External Calendar Block", tone: "neutral" },
  review: { label: "Needs Review", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
  checked_in: { label: "Checked In", tone: "ok" },
  checked_out: { label: "Checked Out", tone: "neutral" },
};

export type ResStatus = { key: ResStatusKey; label: string; tone: Tone; detail: string };

/**
 * A reservation's status from any source. `status` is the stored status (website bookings: pending / awaiting_payment / confirmed /
 * declined / cancelled / expired; other sites: confirmed / cancelled). `kind` is set for other-site stays: "reservation", or
 * "unknown" / "blocked" / "mirror" when the calendar link only marks the dates unavailable. `needsReview` is true while the stay
 * is part of an open double booking. Checked In / Checked Out follow the listing's check-in and check-out times when `clock` is given.
 */
export function reservationStatus(r: { status: string; check_in: string; check_out: string; today: string; kind?: string | null; needsReview?: boolean; clock?: StayClock }): ResStatus {
  const make = (key: ResStatusKey, detail = ""): ResStatus => ({ key, ...RES_STATUS[key], detail });
  if (r.status === "declined") return make("cancelled", "Declined by the host");
  if (r.status === "expired") return make("cancelled", "Expired before it was confirmed");
  if (r.status === "cancelled") return make("cancelled");
  if (r.kind && r.kind !== "reservation") return make("block", r.kind === "mirror" ? "Same dates as a reservation from another site" : "Dates closed by another site's calendar");
  if (r.needsReview) return make("review", "Part of a double booking");
  if (r.status === "pending") return make("pending", "Waiting for the host to accept");
  if (r.status === "awaiting_payment") return make("pending", "Waiting for payment");
  const phase = stayPhase(r.status, r.check_in, r.check_out, r.today, r.clock);
  if (phase === "current") return make("checked_in");
  if (phase === "past") return make("checked_out");
  return make("confirmed");
}

export type PayStatusKey = "unpaid" | "deposit" | "partial" | "paid" | "refunded" | "unavailable";
export const PAY_STATUS: Record<PayStatusKey, string> = { unpaid: "Unpaid", deposit: "Deposit Paid", partial: "Partially Paid", paid: "Paid in Full", refunded: "Refunded", unavailable: "Payment unavailable" };

type PayFields = { status: string; payment_method: string | null; payment_status: string; total_cents: number; paid_cents: number; due_now_cents?: number; deposit_due_cents?: number; payment_due_date?: string | null; fixed_price?: boolean };
export type PayStatus = { key: PayStatusKey; label: string; tone: Tone; detail: string };

/** Payment status of a Sevgio booking, kept apart from the reservation status. */
export function paymentStatus(b: PayFields): PayStatus {
  const make = (key: PayStatusKey, tone: Tone, detail = ""): PayStatus => ({ key, label: PAY_STATUS[key], tone, detail });
  const balance = b.total_cents - b.paid_cents;
  if (b.payment_status === "refunded") return make("refunded", "neutral", b.paid_cents > 0 ? `${money(b.paid_cents)} returned to the guest` : "");
  if (b.payment_status === "paid" || (b.paid_cents > 0 && balance <= 0)) return make("paid", "ok");
  if (b.payment_status === "processing") return make(b.paid_cents > 0 ? "partial" : "unpaid", "warn", "Bank transfer processing");
  const dueBy = b.payment_due_date ? ` by ${fmtShort(b.payment_due_date)}` : "";
  // A corporate reservation with a deposit: Deposit Paid once the deposit is in, Partially Paid before that.
  if (b.paid_cents > 0 && (b.deposit_due_cents ?? 0) > 0 && b.paid_cents >= (b.deposit_due_cents ?? 0)) return make("deposit", "warn", `${money(balance)} due${dueBy}`);
  if (b.paid_cents > 0) return make("partial", "warn", `${money(balance)} due${dueBy}`);
  if (["cancelled", "declined", "expired"].includes(b.status)) return make("unpaid", "neutral", "Nothing is owed");
  if (b.payment_status === "failed") return make("unpaid", "danger", "The last payment attempt failed");
  if (b.status === "pending") return make("unpaid", "neutral", "Nothing is due until the host accepts");
  // A website booking made before a payment option was chosen still owes its total.
  if ((b.deposit_due_cents ?? 0) > 0) return make("unpaid", "warn", `${money(b.deposit_due_cents ?? 0)} deposit due now, ${money(balance)} in all${dueBy}`);
  if (!b.payment_method) return make("unpaid", "warn", `${money(balance)} due${dueBy}`);
  if (b.payment_method === "cash" && !b.due_now_cents) return make("unpaid", "warn", `${money(balance)} due at the property`);
  return make("unpaid", "warn", "Waiting for payment");
}

/** "Unpaid · $850 due at the property" for emails and plain text. */
export const paymentText = (b: PayFields) => { const p = paymentStatus(b); return p.detail ? `${p.label} · ${p.detail}` : p.label; };

/** What a guest is told about paying later, on the confirmation page and in the email. `online`: card or bank transfer can be paid from the booking page. */
export function paymentLater(b: PayFields, online = false): string {
  if (!["confirmed", "awaiting_payment"].includes(b.status) || b.total_cents - b.paid_cents <= 0) return "";
  if (b.fixed_price) {
    const balance = b.total_cents - b.paid_cents, deposit = Math.max(0, (b.deposit_due_cents ?? 0) - b.paid_cents);
    const by = b.payment_due_date ? ` by ${fmtShort(b.payment_due_date)}` : "";
    return deposit > 0 && deposit < balance ? `Pay the ${money(deposit)} deposit now and the remaining ${money(balance - deposit)}${by}, as shown under Pay now.` : `Pay the ${money(balance)}${by}, as shown under Pay now.`;
  }
  if (b.status === "confirmed" && online && (!b.payment_method || (b.payment_method === "cash" && !b.due_now_cents))) {
    return `Pay the ${money(b.total_cents - b.paid_cents)} online now from your booking page, or pay at the property.`;
  }
  if (b.payment_method === "cash" && !b.due_now_cents) return "Payment due at property.";
  if (!b.payment_method) return "Host will contact you regarding payment.";
  return "";
}

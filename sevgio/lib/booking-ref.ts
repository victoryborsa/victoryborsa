// Booking references and the plain-language labels shown wherever a reservation appears:
// the confirmation page and email, the guest's trips, the admin search and the invoice.
// No database access here, so it can be used anywhere and tested on its own.
import { money } from "./money.ts";

export const KEEP_REFERENCE = "Please keep your booking reference number and provide it when contacting us about your reservation.";

/** A booking reference without spaces, dashes or capitalization differences: "sv-abc 234" → "SVABC234". */
export const compactRef = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Escapes % and _ so a search term is matched literally inside ILIKE '%…%'. */
export const likeSafe = (s: string) => s.replace(/[\\%_]/g, m => "\\" + m);

/** The words of a name search, each matched on its own: "john smith" finds "John A. Smith". */
export const nameWords = (term: string) => term.trim().split(/\s+/).filter(Boolean).slice(0, 5);

export type Phase = "current" | "upcoming" | "past" | "cancelled";
export const PHASE_LABEL: Record<Phase, string> = { current: "Staying now", upcoming: "Upcoming", past: "Past", cancelled: "Cancelled" };
export const PHASE_TONE: Record<Phase, "ok" | "info" | "danger" | "neutral"> = { current: "ok", upcoming: "info", past: "neutral", cancelled: "danger" };

/** "3:00 pm", "11 AM" or "15:30" → minutes after midnight. Unreadable times fall back to `fallback`. */
export function clockMinutes(t: string | null | undefined, fallback: number): number {
  const m = (t || "").trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return fallback;
  let h = Number(m[1]) % 24;
  const pm = m[3]?.startsWith("p"), am = m[3]?.startsWith("a");
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return h * 60 + Number(m[2] || 0);
}

/** The property's local time now (Pittsburgh): its date and the minutes since midnight. */
export function localNow(tz = "America/New_York", now = new Date()): { date: string; minutes: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** The listing's check-in and check-out times, for `stayPhase`. */
export type StayClock = { minutes: number; checkInTime?: string | null; checkOutTime?: string | null };

/**
 * Where a stay sits in time. Declined and expired requests are grouped with cancellations.
 * With `clock` (the local time now and the listing's check-in / check-out times), the stay starts at check-in time on the arrival day
 * and ends at check-out time on the departure day; without it, whole days are used.
 */
export function stayPhase(status: string, checkIn: string, checkOut: string, today: string, clock?: StayClock): Phase {
  if (["cancelled", "declined", "expired"].includes(status)) return "cancelled";
  if (checkOut < today) return "past";
  if (clock && checkOut === today && clock.minutes >= clockMinutes(clock.checkOutTime, 11 * 60)) return "past";
  if (checkIn > today) return "upcoming";
  if (clock && checkIn === today && clock.minutes < clockMinutes(clock.checkInTime, 15 * 60)) return "upcoming";
  return "current";
}

type PayFields = { status: string; payment_method: string | null; payment_status: string; total_cents: number; paid_cents: number; card_fee_cents?: number };

/** Payment status in words, with a tone for the colored pill. */
export function paymentLabel(b: PayFields): { label: string; tone: "ok" | "warn" | "danger" | "neutral" } {
  const balance = b.total_cents - b.paid_cents;
  if (b.payment_status === "paid" || (b.paid_cents > 0 && balance <= 0)) return { label: "Paid in full", tone: "ok" };
  if (b.payment_status === "processing") return { label: "Bank transfer processing", tone: "warn" };
  if (b.payment_status === "failed") return { label: "Payment failed", tone: "danger" };
  if (b.paid_cents > 0) return { label: `Partly paid, ${money(balance)} due`, tone: "warn" };
  if (["cancelled", "declined", "expired"].includes(b.status)) return { label: "Not paid", tone: "neutral" };
  if (!b.payment_method) return { label: b.status === "pending" ? "Not due yet" : "Paid to host directly", tone: "neutral" };
  if (b.status === "pending") return { label: "Not due yet", tone: "neutral" };
  return { label: "Waiting for payment", tone: "warn" };
}

export type SearchRow = {
  source: "sevgio" | "channel";
  id: string;
  ref: string;
  guest_name: string;
  guest_email: string;
  title: string;
  check_in: string;
  check_out: string;
  guests: number | null;
  status: string;
  status_label: string;
  status_tone: "ok" | "warn" | "danger" | "neutral";
  pay_label: string;
  pay_tone: "ok" | "warn" | "danger" | "neutral";
  phase: Phase;
  href: string;
  site: string;
  created_at: string;
};

const PHASE_ORDER: Record<Phase, number> = { current: 0, upcoming: 1, past: 2, cancelled: 3 };

/** Exact reference first, then guests staying now, upcoming (soonest first), past and cancelled (latest first). */
export function sortResults(rows: SearchRow[], term: string): SearchRow[] {
  const exact = compactRef(term);
  return [...rows].sort((a, b) => {
    const ea = exact.length >= 4 && compactRef(a.ref) === exact ? 0 : 1;
    const eb = exact.length >= 4 && compactRef(b.ref) === exact ? 0 : 1;
    if (ea !== eb) return ea - eb;
    if (a.phase !== b.phase) return PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
    const byDate = a.check_in < b.check_in ? -1 : a.check_in > b.check_in ? 1 : 0;
    return a.phase === "upcoming" || a.phase === "current" ? byDate : -byDate;
  });
}

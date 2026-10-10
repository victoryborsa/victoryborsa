// Rules for the Reservations list and calendar that must be the same everywhere (screens, server actions and tests):
// who may edit a reservation, which stays belong in Today / Upcoming / History, and how cards are grouped.
// No database access here, so the unit tests can check every rule directly.

/** Where a reservation came from. Only "direct" (booked on Sevgio.com, or added by an admin) can ever be edited. */
export type ResSource = "direct" | "external" | "block";

/**
 * Reservations from other sites are read-only. This switch only decides whether a host may still keep private Sevgio notes on them
 * (a guest name the site didn't send, the site's reference, payout amounts for Finance). Off: those only come from imported files.
 * Dates, status, cancelling, deleting and calling a block a reservation stay locked either way.
 */
export const EXTERNAL_NOTES_EDITABLE = false;

export type EditFields = { source: ResSource; status: string; payment_status?: string | null; paid_cents?: number | null; fixed_price?: boolean };
export type EditRule = { editable: boolean; reason: string };

const ACTIVE = ["pending", "awaiting_payment", "confirmed"];

/**
 * Only unpaid Sevgio.com bookings can be edited, past ones included. Paid or partly paid bookings, cancelled ones,
 * reservations synced from Airbnb, Booking.com, Vrbo or any other site, and external calendar blocks are read-only.
 * Missing payment details never make an outside reservation editable: the source is checked first.
 */
export function editRule(r: EditFields): EditRule {
  if (r.source === "external") return { editable: false, reason: "Synced from another site, so it is read-only here. Changes must be made on that site." };
  if (r.source === "block") return { editable: false, reason: "External calendar block: read-only. It follows the other site's calendar." };
  if (!ACTIVE.includes(r.status)) return { editable: false, reason: "Cancelled, declined or expired reservations are read-only." };
  // A corporate-housing reservation stays editable after the deposit is in, so the admin can extend or shorten it.
  if (r.fixed_price && r.payment_status !== "processing" && r.payment_status !== "refunded") return { editable: true, reason: "Corporate housing reservation: can be edited or extended." };
  if ((r.paid_cents ?? 0) > 0 || ["paid", "deposit_paid", "processing", "refunded"].includes(r.payment_status || ""))
    return { editable: false, reason: "A payment has been made or is processing, so this reservation is read-only." };
  return { editable: true, reason: "Unpaid Sevgio.com booking: can be edited." };
}

/** Today: arriving, staying or leaving today. Upcoming: not finished yet (today's departures included). History: finished or cancelled. */
export type Scope = "today" | "upcoming" | "history";
export const SCOPES: [Scope, string][] = [["today", "Today"], ["upcoming", "Upcoming"], ["history", "History"]];

const isCancelled = (status: string) => ["cancelled", "declined", "expired"].includes(status);

/**
 * Whether a stay (check-in `from`, check-out `to`) belongs in a list. `day` is today in Pittsburgh, or the day picked
 * with the date picker. A stay from Oct 1 to Oct 4 is not in Oct 8's list; one from Oct 5 to Oct 12 is.
 */
export function inScope(scope: Scope, s: { from: string; to: string; status: string }, day: string): boolean {
  if (scope === "history") return isCancelled(s.status) || s.to < day;
  if (isCancelled(s.status)) return false;
  if (scope === "today") return s.from <= day && s.to >= day;
  return s.to >= day;
}

/** What the guest does on `day`: arrives, is staying, leaves, or neither. */
export function dayRole(s: { from: string; to: string }, day: string): "arriving" | "staying" | "leaving" | null {
  if (s.from === day) return "arriving";
  if (s.to === day) return "leaving";
  if (s.from < day && day < s.to) return "staying";
  return null;
}
export const ROLE_LABEL = { arriving: "Arriving today", staying: "Staying", leaving: "Leaving today" } as const;

export type Sort = "arrival" | "booked";

/**
 * Groups cards by date, then by property (a house and its rooms together). With "arrival" the date is check-in, earliest
 * first (latest first in History); with "booked" it is the day the reservation was made, newest first. Stays whose site
 * never told us when they were booked go in their own group at the end, so no date is made up.
 */
export function groupReservations<T extends { from: string; booked: string | null; home: string; place: string; label: string }>(
  items: T[], sort: Sort, scope: Scope,
): { date: string | null; homes: { home: string; items: T[] }[] }[] {
  const key = (t: T) => (sort === "booked" ? t.booked : t.from);
  const desc = sort === "booked" || scope === "history";
  const sorted = [...items].sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (ka !== kb) return ka == null ? 1 : kb == null ? -1 : desc ? kb.localeCompare(ka) : ka.localeCompare(kb);
    return a.home.localeCompare(b.home) || a.place.localeCompare(b.place) || a.from.localeCompare(b.from) || a.label.localeCompare(b.label);
  });
  const out: { date: string | null; homes: { home: string; items: T[] }[] }[] = [];
  for (const it of sorted) {
    const d = key(it);
    let g = out[out.length - 1];
    if (!g || g.date !== d) out.push(g = { date: d, homes: [] });
    let h = g.homes.find(x => x.home === it.home);
    if (!h) g.homes.push(h = { home: it.home, items: [] });
    h.items.push(it);
  }
  return out;
}

/** Message delivery states shown to the sender. "Read" needs the other side to have opened the conversation; nothing claims more than we know. */
export function messageState(m: { read_at: string | null }): "sent" | "read" {
  return m.read_at ? "read" : "sent";
}

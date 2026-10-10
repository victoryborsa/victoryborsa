import { addDays } from "./dates.ts";

/** Booking sites Sevgio knows by name. "sevgio" is a direct booking on this website. */
export const CHANNELS = [
  ["sevgio", "Sevgio (direct)"], ["airbnb", "Airbnb"], ["vrbo", "Vrbo"], ["bookingcom", "Booking.com"], ["furnished", "Furnished Finder"], ["other", "Other sites"],
] as const;
export type ChannelKey = (typeof CHANNELS)[number][0];
export const channelLabel = (k: string) => CHANNELS.find(c => c[0] === k)?.[1] ?? "Other site";
export const isChannel = (k: unknown): k is ChannelKey => CHANNELS.some(c => c[0] === k);

/** Which booking site a calendar link belongs to, by its name, or else by its web address. */
export function channelOf(feedName: string | null, url = ""): { key: ChannelKey; label: string } {
  const n = `${feedName || ""} ${url}`.toLowerCase();
  const key: ChannelKey = n.includes("airbnb") ? "airbnb" : n.includes("booking") ? "bookingcom" : n.includes("vrbo") || n.includes("homeaway") ? "vrbo"
    : n.includes("furnished") ? "furnished" : "other";
  return { key, label: key === "other" ? feedName || "Other site" : channelLabel(key) };
}

/**
 * What a calendar event from another site is. Each site words it differently:
 * - Airbnb: "Reserved" (with the confirmation code in the description) vs "Airbnb (Not available)" for dates the host blocked.
 * - Vrbo: "Reserved - Guest Name" for some reservations, but "Blocked" both for owner holds and for reservations and dates copied in from other calendars.
 * - Booking.com: "CLOSED - Not available" for both reservations and closed dates.
 * Only Airbnb's "Not available" and periods that say owner / maintenance are known to have no guest. Anything else that isn't clearly
 * a reservation is "unknown": it still shows in the reservation lists, marked for the host to check, unless it only copies another booking.
 */
/** The last 4 digits of the guest's phone, which Airbnb puts in the event description. */
export const phoneLast4 = (description: string) => description.match(/last\s*4\s*digits\)?\s*:?\s*(\d{4})/i)?.[1] || "";

export function classifyEvent(channel: string, summary: string, description = ""): { kind: "reservation" | "blocked" | "unknown"; ref: string; guest: string } {
  const s = summary.trim(), all = `${s}\n${description}`;
  const ref = (description.match(/reservations\/details\/([A-Z0-9]{6,14})/i)?.[1]
    || all.match(/(?:confirmation|reservation|booking)\s*(?:code|number|no\.?|id|#)\s*[:#]?\s*([A-Z0-9-]{5,20})/i)?.[1] || "").toUpperCase();
  let guest = "";
  const named = s.match(/^(?:reserved|booked|reservation)\s*[-–:]\s*(.+)$/i);
  if (named && !/not available|blocked/i.test(named[1])) guest = named[1].trim().slice(0, 80);
  if (/\breserv|\bbooked\b|\bbooking\b|\bguest\b/i.test(s) && !/not available|unavailable|blocked/i.test(s)) return { kind: "reservation", ref, guest };
  if (ref) return { kind: "reservation", ref, guest };
  if (/\b(owner|maintenance|repairs?|cleaning)\b/i.test(s)) return { kind: "blocked", ref, guest };
  if (channel === "airbnb" && /not available|unavailable|blocked/i.test(s)) return { kind: "blocked", ref, guest };
  return { kind: "unknown", ref, guest };
}

/** A listing for occupancy: a whole home or a room inside one (parent_id). */
export type Unit = { id: string; parent_id: string | null };
export type NightStay = { property_id: string; from: string; to: string; kind: "booked" | "blocked" | "unknown" };

/**
 * Occupancy over [start, end) without double counting whole homes and their rooms.
 * A home with rooms is measured room by room: booking the whole home fills every room for those nights,
 * and a room booking fills only that room. Nights already booked aren't counted again as blocked.
 * `units` are the listings in the report (rooms count as units; a home with rooms is not itself a unit).
 */
export function occupancy(units: Unit[], stays: NightStay[], start: string, end: string) {
  let booked = 0, blocked = 0, unknown = 0, capacity = 0;
  const byProp = new Map<string, NightStay[]>();
  for (const s of stays) byProp.set(s.property_id, [...(byProp.get(s.property_id) || []), s]);
  for (const u of units) {
    const mine = [...(byProp.get(u.id) || []), ...(u.parent_id ? byProp.get(u.parent_id) || [] : [])];
    for (let d = start; d < end; d = addDays(d, 1)) {
      capacity++;
      const on = mine.filter(s => s.from <= d && d < s.to);
      if (on.some(s => s.kind === "booked")) booked++;
      else if (on.some(s => s.kind === "blocked")) blocked++;
      else if (on.some(s => s.kind === "unknown")) unknown++;
    }
  }
  // Blocked nights can't be sold, so they come off what was available.
  const open = capacity - blocked;
  return { booked, blocked, unknown, capacity, percent: open > 0 ? Math.round((booked / open) * 1000) / 10 : null };
}

/** The listings that count as units: rooms of a home, or the home itself when it has no rooms. */
export function unitsOf<T extends Unit>(listings: T[]): T[] {
  return listings.filter(l => !listings.some(r => r.parent_id === l.id));
}

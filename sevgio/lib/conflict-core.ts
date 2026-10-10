import { nightsBetween } from "./dates.ts";

/** A listing as far as double bookings go: a whole home, or a room inside one (parent_id). */
export type ConflictUnit = { id: string; parent_id: string | null; check_in_time: string; check_out_time: string; turnaround_hours: number };

/** One active reservation: a Sevgio booking ("b:<id>") or a reservation from Airbnb, Booking.com, Vrbo or another site ("c:<id>"). */
export type ConflictStay = { key: string; property_id: string; check_in: string; check_out: string; channel: string };

export type FoundConflict = {
  pair_key: string; a: ConflictStay; b: ConflictStay; kind: "overlap" | "turnaround";
  start: string; end: string; gap_hours: number | null; needed_hours: number | null; property_ids: string[];
};

/** Reads "3:00 pm", "3 PM", "15:30", "11am" or "noon" as hours after midnight (3:30 pm = 15.5). */
export function clockHours(t: string, fallback: number): number {
  const s = (t || "").trim().toLowerCase();
  if (s.startsWith("noon")) return 12;
  const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/);
  if (!m) return fallback;
  let h = Number(m[1]);
  const ap = m[3]?.[0];
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  const v = h + Number(m[2] || 0) / 60;
  return v >= 0 && v < 24 ? v : fallback;
}

/** Whether two listings share nights: the same listing, or a whole home and one of its rooms. Two rooms of one home don't. */
export function sharesNights(x: ConflictUnit, y: ConflictUnit): boolean {
  return x.id === y.id || x.parent_id === y.id || y.parent_id === x.id;
}

export const pairKey = (k1: string, k2: string) => (k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`);

/**
 * Every pair of active reservations that can't both happen:
 * - "overlap": they share at least one night on the same listing, or on a whole home and one of its rooms;
 * - "turnaround": one checks out and the next checks in with less time between them than the listings need
 *   (their check-out and check-in times, plus the turnover hours set on either listing).
 * A normal same-day changeover (check-out 11 am, check-in 3 pm, no extra turnover set) is not a conflict.
 */
export function findConflicts(units: ConflictUnit[], stays: ConflictStay[]): FoundConflict[] {
  const byId = new Map(units.map(u => [u.id, u]));
  const out: FoundConflict[] = [];
  const sorted = [...stays].filter(s => byId.has(s.property_id) && s.check_out > s.check_in)
    .sort((x, y) => (x.check_in < y.check_in ? -1 : x.check_in > y.check_in ? 1 : x.key < y.key ? -1 : 1));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      const ua = byId.get(a.property_id)!, ub = byId.get(b.property_id)!;
      if (!sharesNights(ua, ub)) continue;
      const property_ids = [...new Set([a.property_id, b.property_id])];
      if (a.check_in < b.check_out && b.check_in < a.check_out) {
        out.push({ pair_key: pairKey(a.key, b.key), a, b, kind: "overlap", start: a.check_in > b.check_in ? a.check_in : b.check_in,
          end: a.check_out < b.check_out ? a.check_out : b.check_out, gap_hours: null, needed_hours: null, property_ids });
        continue;
      }
      // No shared night: check the changeover between whichever leaves first and the next arrival.
      const [first, next] = a.check_out <= b.check_in ? [a, b] : [b, a];
      const uf = byId.get(first.property_id)!, un = byId.get(next.property_id)!;
      const days = nightsBetween(first.check_out, next.check_in);
      const needed = Math.max(uf.turnaround_hours || 0, un.turnaround_hours || 0);
      if (days > Math.ceil(needed / 24) + 1) continue;
      const gap = days * 24 + clockHours(un.check_in_time, 15) - clockHours(uf.check_out_time, 11);
      if (gap < needed) {
        out.push({ pair_key: pairKey(a.key, b.key), a, b, kind: "turnaround", start: first.check_out, end: next.check_in > first.check_out ? next.check_in : first.check_out,
          gap_hours: Math.round(gap * 100) / 100, needed_hours: needed, property_ids });
      }
    }
  }
  return out;
}

/** "3 hours", "1 hour 30 minutes", "no time". */
export function hoursLabel(h: number): string {
  if (h <= 0) return h < 0 ? `${hoursLabel(-h)} too early` : "no time";
  const whole = Math.floor(h), mins = Math.round((h - whole) * 60);
  const parts = [whole ? `${whole} hour${whole === 1 ? "" : "s"}` : "", mins ? `${mins} minutes` : ""].filter(Boolean);
  return parts.join(" ");
}

/** How a host or admin says a conflict was handled. */
export const RESOLUTIONS = [
  ["moved", "Guest moved or rebooked elsewhere"],
  ["cancelled", "One reservation was cancelled on its site"],
  ["same", "Same guest or the same reservation listed twice"],
  ["ok", "Not a problem (planned, or turnover arranged)"],
  ["other", "Something else"],
] as const;

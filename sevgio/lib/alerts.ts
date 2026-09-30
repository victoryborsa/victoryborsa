import "server-only";
import { one, q } from "./db.ts";
import type { User } from "./auth.ts";

const ACTIVE = "b.status IN ('pending','awaiting_payment','confirmed')";

/** How many active bookings this user hasn't looked at yet. */
export async function unseenBookings(u: User): Promise<number> {
  const r = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM bookings b JOIN properties p ON p.id = b.property_id
     WHERE b.seen_at IS NULL AND ${ACTIVE} AND ($1::uuid IS NULL OR p.host_id = $1)`, [u.role === "admin" ? null : u.id]);
  return r?.n ?? 0;
}

/** Marks these bookings as seen; returns the ids that were new so the page can highlight them. */
export async function markSeen(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await q<{ id: string }>("UPDATE bookings SET seen_at = now() WHERE id = ANY($1) AND seen_at IS NULL RETURNING id", [ids]);
  return new Set(rows.map(r => r.id));
}

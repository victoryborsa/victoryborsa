import "server-only";
import { one, q } from "./db.ts";
import type { User } from "./auth.ts";

/** Whole-home listings a room can be linked to: not themselves rooms, and (for hosts) their own. */
export function homesFor(u: User, hostId?: string) {
  if (u.role === "admin" && !hostId)
    return q<{ id: string; title: string; host_name: string }>("SELECT p.id, p.title, h.name AS host_name FROM properties p JOIN users h ON h.id = p.host_id WHERE p.parent_id IS NULL ORDER BY p.title");
  return q<{ id: string; title: string }>("SELECT id, title FROM properties WHERE parent_id IS NULL AND host_id = $1 ORDER BY title", [hostId || u.id]);
}

/** Moves a listing to another host together with its linked family (the whole house and all its rooms),
 *  so linked calendars always share one owner. Returns the titles that moved. */
export async function moveListingFamily(propertyId: string, hostId: string): Promise<string[]> {
  const p = await one<{ id: string; parent_id: string | null }>("SELECT id, parent_id FROM properties WHERE id = $1", [propertyId]);
  if (!p) return [];
  const houseId = p.parent_id ?? p.id;
  const moved = await q<{ title: string }>("UPDATE properties SET host_id = $2, updated_at = now() WHERE id = $1 OR parent_id = $1 RETURNING title", [houseId, hostId]);
  return moved.map(m => m.title);
}

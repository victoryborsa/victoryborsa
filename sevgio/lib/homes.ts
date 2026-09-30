import "server-only";
import { q } from "./db.ts";
import type { User } from "./auth.ts";

/** Whole-home listings a room can be linked to: not themselves rooms, and (for hosts) their own. */
export function homesFor(u: User, hostId?: string) {
  if (u.role === "admin" && !hostId)
    return q<{ id: string; title: string; host_name: string }>("SELECT p.id, p.title, h.name AS host_name FROM properties p JOIN users h ON h.id = p.host_id WHERE p.parent_id IS NULL ORDER BY p.title");
  return q<{ id: string; title: string }>("SELECT id, title FROM properties WHERE parent_id IS NULL AND host_id = $1 ORDER BY title", [hostId || u.id]);
}

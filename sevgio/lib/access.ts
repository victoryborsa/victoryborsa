import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireUser, type User } from "./auth.ts";
import { propertyById } from "./queries.ts";
import type { Property } from "./bookings.ts";

/** Hosts can manage only their own listings; admins can manage all. Everyone else is refused. */
export async function requireManageable(propertyId: string, next?: string): Promise<{ u: User; p: Property }> {
  const u = await requireUser(["host", "admin"], next);
  const p = await propertyById(propertyId);
  if (!p) notFound();
  if (u.role !== "admin" && p.host_id !== u.id) redirect("/no-access");
  return { u, p };
}

/** SQL condition limiting rows to properties this user may manage. `alias` is the properties table alias. */
export function scopeSql(u: User, alias = "p", paramIndex = 1): { sql: string; params: unknown[] } {
  return u.role === "admin" ? { sql: "TRUE", params: [] } : { sql: `${alias}.host_id = $${paramIndex}`, params: [u.id] };
}

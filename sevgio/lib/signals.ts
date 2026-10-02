import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { one, q } from "./db.ts";
import { currentUser } from "./auth.ts";
import { todayLocal } from "./dates.ts";

// Views, favourites, interest and shares shown on every listing ("428 views · 93 times saved as favourite · ...").
export type Signal = "view" | "favorite" | "interested" | "share";
export type ListingStats = { views: number; favorites: number; interested: number; shares: number; saved: boolean };

const COOKIE = "sv_vid";

/** Who is doing this: the signed-in account, or else an anonymous id kept in a cookie (made when `create` is set). */
export async function visitorKey(create = false): Promise<string | null> {
  const u = await currentUser();
  if (u) return `u:${u.id}`;
  const jar = await cookies();
  let id = jar.get(COOKIE)?.value;
  if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    if (!create) return null;
    id = crypto.randomBytes(18).toString("base64url");
    jar.set(COOKIE, id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  }
  return `v:${id}`;
}

/** Counts each visitor once: views once a day, shares once a day per app, interest and favourites once. */
export async function recordSignal(propertyId: string, kind: Exclude<Signal, "favorite">, visitor: string, channel = "") {
  const k = kind === "view" ? todayLocal() : kind === "share" ? `${channel.slice(0, 30)}:${todayLocal()}` : "";
  await q("INSERT INTO listing_signals (property_id, kind, visitor, k) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [propertyId, kind, visitor, k]);
}

export async function setFavorite(propertyId: string, visitor: string, on: boolean) {
  if (on) await q("INSERT INTO listing_signals (property_id, kind, visitor) VALUES ($1, 'favorite', $2) ON CONFLICT DO NOTHING", [propertyId, visitor]);
  else await q("DELETE FROM listing_signals WHERE property_id = $1 AND kind = 'favorite' AND visitor = $2", [propertyId, visitor]);
}

export async function listingStats(propertyId: string, visitor: string | null): Promise<ListingStats> {
  const r = await one<ListingStats>(
    `SELECT count(*) FILTER (WHERE kind = 'view') AS views, count(*) FILTER (WHERE kind = 'favorite') AS favorites,
            count(*) FILTER (WHERE kind = 'interested') AS interested, count(*) FILTER (WHERE kind = 'share') AS shares,
            coalesce(bool_or(kind = 'favorite' AND visitor = $2), false) AS saved
       FROM listing_signals WHERE property_id = $1`, [propertyId, visitor ?? ""]);
  return r ?? { views: 0, favorites: 0, interested: 0, shares: 0, saved: false };
}

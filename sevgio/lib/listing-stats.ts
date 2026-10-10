import { q } from "./db.ts";

export type StatKind = "view" | "favorite" | "interested" | "share";
export type ListingStats = { views: number; favorites: number; interested: number; shares: number; mine: { favorite: boolean; interested: boolean } };

/** The cookie that tells repeat visitors apart (a random id, nothing personal). */
export const VISITOR_COOKIE = "sv";

export async function listingStats(propertyId: string, visitor?: string): Promise<ListingStats> {
  const rows = await q<{ kind: StatKind; n: string; mine: boolean }>(
    "SELECT kind, count(*) AS n, bool_or(visitor = $2) AS mine FROM listing_activity WHERE property_id = $1 GROUP BY kind",
    [propertyId, visitor || ""],
  );
  const get = (k: StatKind) => rows.find(r => r.kind === k);
  return {
    views: Number(get("view")?.n || 0), favorites: Number(get("favorite")?.n || 0),
    interested: Number(get("interested")?.n || 0), shares: Number(get("share")?.n || 0),
    mine: { favorite: !!get("favorite")?.mine, interested: !!get("interested")?.mine },
  };
}

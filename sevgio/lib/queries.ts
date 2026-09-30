import "server-only";
import { q, one } from "./db.ts";
import type { Property } from "./bookings.ts";
import { AMENITY_FILTERS } from "./constants.ts";

export type Photo = { id: string; property_id: string; position: number; caption: string; width: number; height: number };
export type CardProperty = Property & { cover_id: string | null };

export const photoUrl = (id: string, size: "thumb" | "large" = "large") => `/api/photos/${id}?s=${size}`;

const COVER = `(SELECT id FROM photos ph WHERE ph.property_id = p.id ORDER BY position, created_at LIMIT 1) AS cover_id`;

export type SearchFilters = {
  loc?: string; ci?: string; co?: string; guests?: number; maxPrice?: number; bedrooms?: number; baths?: number; amenities?: string[]; instant?: boolean; privateBath?: boolean; sort?: string;
};

export async function searchProperties(f: SearchFilters): Promise<CardProperty[]> {
  const where = ["p.status = 'published'"];
  const params: unknown[] = [];
  const add = (v: unknown) => { params.push(v); return "$" + params.length; };
  if (f.loc) where.push(`(p.city || ' ' || p.area || ' ' || p.title) ILIKE ${add("%" + f.loc.replace(/[%_\\]/g, "\\$&") + "%")}`);
  if (f.guests) where.push(`p.max_guests >= ${add(f.guests)}`);
  if (f.maxPrice) where.push(`p.nightly_price_cents <= ${add(f.maxPrice * 100)}`);
  if (f.bedrooms) where.push(`p.bedrooms >= ${add(f.bedrooms)}`);
  if (f.baths) where.push(`p.bathrooms >= ${add(f.baths)}`);
  // Each chosen filter matches any of its amenity keys (e.g. "Free parking" = street, driveway or garage).
  for (const key of f.amenities || []) if (AMENITY_FILTERS[key]) where.push(`p.amenities && ${add(AMENITY_FILTERS[key].keys)}::text[]`);
  if (f.instant) where.push(`p.booking_mode = 'instant'`);
  if (f.privateBath) where.push(`p.bathroom_type = 'private'`);
  if (f.ci && f.co) {
    const ci = add(f.ci), co = add(f.co);
    where.push(`(${co}::date - ${ci}::date) BETWEEN p.min_nights AND p.max_nights`);
    where.push(`NOT EXISTS (SELECT 1 FROM bookings b WHERE b.property_id IN (SELECT r.id FROM properties r WHERE r.id = p.id OR r.parent_id = p.id OR r.id = p.parent_id) AND b.status IN ('pending','awaiting_payment','confirmed') AND b.check_in < ${co} AND b.check_out > ${ci})`);
    where.push(`NOT EXISTS (SELECT 1 FROM blocks k WHERE k.property_id IN (SELECT r.id FROM properties r WHERE r.id = p.id OR r.parent_id = p.id OR r.id = p.parent_id) AND k.start_date < ${co} AND k.end_date > ${ci})`);
  }
  const order: Record<string, string> = {
    price_asc: "p.nightly_price_cents ASC",
    price_desc: "p.nightly_price_cents DESC",
    rating: "p.rating DESC NULLS LAST, p.review_count DESC",
    guests: "p.max_guests DESC",
    recommended: "coalesce(p.rating, 4.6) * ln(p.review_count + 2) DESC, p.created_at DESC",
  };
  return q<CardProperty>(`SELECT p.*, ${COVER} FROM properties p WHERE ${where.join(" AND ")} ORDER BY ${order[f.sort || ""] || order.recommended} LIMIT 120`, params);
}

export async function featuredProperties(limit = 6) {
  return q<CardProperty>(`SELECT p.*, ${COVER} FROM properties p WHERE p.status = 'published' ORDER BY coalesce(p.rating, 4.6) * ln(p.review_count + 2) DESC, p.created_at DESC LIMIT $1`, [limit]);
}

export async function propertyBySlug(slug: string) {
  return one<Property>("SELECT * FROM properties WHERE slug = $1", [slug]);
}

export async function propertyById(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one<Property>("SELECT * FROM properties WHERE id = $1", [id]);
}

export async function photosFor(propertyId: string) {
  return q<Photo>("SELECT id, property_id, position, caption, width, height FROM photos WHERE property_id = $1 ORDER BY position, created_at", [propertyId]);
}

export async function publishedCities() {
  return (await q<{ city: string }>("SELECT DISTINCT city FROM properties WHERE status = 'published' ORDER BY city")).map(r => r.city);
}

/** The whole home a room belongs to, and the rooms inside a whole home (published only), for linking between them. */
export async function linkedListings(p: Property) {
  const parent = p.parent_id ? await one<CardProperty>(`SELECT p.*, ${COVER} FROM properties p WHERE p.id = $1 AND p.status = 'published'`, [p.parent_id]) : null;
  const rooms = await q<CardProperty>(`SELECT p.*, ${COVER} FROM properties p WHERE p.parent_id = $1 AND p.status = 'published' ORDER BY p.nightly_price_cents`, [p.id]);
  return { parent, rooms };
}

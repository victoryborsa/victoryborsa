import "server-only";
import { one, q } from "./db.ts";
import { logEvent } from "./log.ts";

// OpenStreetMap's free address lookup. Its rules: identify the site, and at most one request per second.
const BASE = () => (process.env.GEOCODE_BASE || "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const enabled = () => process.env.GEOCODE !== "off";
// The US Census Bureau's free address lookup: knows almost every US house number, which OpenStreetMap often doesn't.
const CENSUS = () => (process.env.CENSUS_GEOCODE_BASE || "https://geocoding.geo.census.gov").replace(/\/$/, "");
const valid = (lat: number, lng: number) => (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null);

/** Finds a US street address with the Census Bureau, or null. Never throws. */
export async function geocodeCensus(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!enabled() || !address.trim()) return null;
  try {
    const url = `${CENSUS()}/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: { addressMatches?: { coordinates?: { x?: number; y?: number } }[] } };
    const c = body?.result?.addressMatches?.[0]?.coordinates;
    return c ? valid(Number(c.y), Number(c.x)) : null;
  } catch {
    return null;
  }
}

/** The address with its town and state added when the host left them out ("12 Main St" → "12 Main St, Pittsburgh, PA"). */
export function fullAddress(address: string, city: string): string {
  let a = address.trim().replace(/\s+/g, " ");
  if (!a) return "";
  if (city && !a.toLowerCase().includes(city.toLowerCase())) a += `, ${city}`;
  if (!/\b(PA|Pennsylvania)\b/i.test(a)) a += ", PA";
  return a;
}

/** Finds the map position of an address in the US, or null. Never throws. */
export async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  if (!enabled() || !query.trim()) return null;
  try {
    const url = `${BASE()}/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "User-Agent": `SevgioStays/1.0 (${process.env.SITE_URL || "sevgio.onrender.com"})`, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const rows = (await res.json()) as { lat?: string; lon?: string }[];
    return rows?.[0] ? valid(Number(rows[0].lat), Number(rows[0].lon)) : null;
  } catch {
    return null;
  }
}

/** Looks up one listing's position from its address and saves it. */
export async function geocodeListing(id: string): Promise<boolean> {
  const p = await one<{ address: string; city: string; area: string; title: string }>("SELECT address, city, area, title FROM properties WHERE id = $1", [id]);
  if (!p) return false;
  const addr = fullAddress(p.address || "", p.city);
  const noUnit = addr.replace(/\s*(#|apt\.?|unit|suite|ste\.?)\s*[\w-]+/gi, "");
  // Census Bureau first (best for house numbers), then OpenStreetMap, then both again without an apartment/unit number.
  const tries: [typeof geocode, string][] = [[geocodeCensus, addr], [geocode, addr]];
  if (noUnit !== addr) tries.push([geocodeCensus, noUnit], [geocode, noUnit]);
  let pos: { lat: number; lng: number } | null = null;
  for (const [find, a] of tries) if (a && (pos = await find(a))) break;
  // Still not found: save nothing, so the map shows the listing at its neighborhood (see AREA_CENTERS in map-pins.ts),
  // never at a whole-city guess downtown.
  await q("UPDATE properties SET lat = $2, lng = $3, geocoded_at = now() WHERE id = $1", [id, pos?.lat ?? null, pos?.lng ?? null]);
  if (!pos && enabled()) await logEvent("warn", "Map", `Couldn't find "${p.title}" on the map. Check its address.`, { property: id });
  return !!pos;
}

/** Hourly: finds listings that aren't on the map yet (a few at a time, one per second, as OpenStreetMap asks). */
export async function geocodeMissing(limit = 20, retryAll = false): Promise<number> {
  if (!enabled()) return 0;
  const rows = await q<{ id: string }>(`SELECT id FROM properties WHERE lat IS NULL ${retryAll ? "" : "AND (geocoded_at IS NULL OR geocoded_at < now() - interval '1 day')"} ORDER BY created_at LIMIT $1`, [limit]);
  let found = 0;
  for (const r of rows) {
    if (await geocodeListing(r.id)) found++;
    await new Promise(res => setTimeout(res, 1100));
  }
  return found;
}

import "server-only";
import { one, q } from "./db.ts";
import { logEvent } from "./log.ts";

// OpenStreetMap's free address lookup. Its rules: identify the site, and at most one request per second.
const BASE = () => (process.env.GEOCODE_BASE || "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const enabled = () => process.env.GEOCODE !== "off";

/** Finds the map position of an address in the US, or null. Never throws. */
export async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  if (!enabled() || !query.trim()) return null;
  try {
    const url = `${BASE()}/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "User-Agent": `SevgioStays/1.0 (${process.env.SITE_URL || "sevgio.onrender.com"})`, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const rows = (await res.json()) as { lat?: string; lon?: string }[];
    const lat = Number(rows?.[0]?.lat), lng = Number(rows?.[0]?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  } catch {
    return null;
  }
}

/** Looks up one listing's position from its address (or its town if there's no address) and saves it. */
export async function geocodeListing(id: string): Promise<boolean> {
  const p = await one<{ address: string; city: string; area: string; title: string }>("SELECT address, city, area, title FROM properties WHERE id = $1", [id]);
  if (!p) return false;
  let pos = p.address ? await geocode(p.address) : null;
  if (!pos) pos = await geocode(`${p.city}, Pennsylvania`);
  await q("UPDATE properties SET lat = $2, lng = $3, geocoded_at = now() WHERE id = $1", [id, pos?.lat ?? null, pos?.lng ?? null]);
  if (!pos && enabled()) await logEvent("warn", "Map", `Couldn't find "${p.title}" on the map. Check its address.`, { property: id });
  return !!pos;
}

/** Hourly: finds listings that aren't on the map yet (a few at a time, one per second, as OpenStreetMap asks). */
export async function geocodeMissing(limit = 20): Promise<number> {
  if (!enabled()) return 0;
  const rows = await q<{ id: string }>("SELECT id FROM properties WHERE lat IS NULL AND (geocoded_at IS NULL OR geocoded_at < now() - interval '1 day') ORDER BY created_at LIMIT $1", [limit]);
  let found = 0;
  for (const r of rows) {
    if (await geocodeListing(r.id)) found++;
    await new Promise(res => setTimeout(res, 1100));
  }
  return found;
}

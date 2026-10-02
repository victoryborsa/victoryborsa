// Where to put a listing's price pin on the search map. Guests see an approximate spot (moved 150–350 m in a
// direction that's fixed per listing), never the exact house, the same way Airbnb does it.

/** Town centers, for listings whose address hasn't been found on the map yet. */
export const TOWN_CENTERS: Record<string, [number, number]> = {
  pittsburgh: [40.4406, -79.9959],
  "downtown pittsburgh": [40.4406, -79.9959],
  indiana: [40.6215, -79.1525],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function approxPosition(p: { id: string; lat: number | null; lng: number | null; city: string }): [number, number] | null {
  const base: [number, number] | undefined = p.lat !== null && p.lng !== null ? [p.lat, p.lng] : TOWN_CENTERS[p.city.trim().toLowerCase()];
  if (!base) return null;
  const h = hash(p.id);
  const angle = ((h % 3600) / 3600) * 2 * Math.PI;
  const meters = 150 + ((h >>> 12) % 200);
  const dLat = (meters * Math.cos(angle)) / 111_320;
  const dLng = (meters * Math.sin(angle)) / (111_320 * Math.cos((base[0] * Math.PI) / 180));
  return [Math.round((base[0] + dLat) * 1e5) / 1e5, Math.round((base[1] + dLng) * 1e5) / 1e5];
}

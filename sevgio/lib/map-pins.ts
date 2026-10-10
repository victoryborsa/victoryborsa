// Where to put a listing's price pin on the search map. Guests see an approximate spot (moved 150–350 m in a
// direction that's fixed per listing), never the exact house, the same way Airbnb does it.

/** Neighborhood centers in and around Pittsburgh: a listing goes in its area even before its address is found. */
export const AREA_CENTERS: Record<string, [number, number]> = {
  "downtown": [40.4406, -79.9959], "north side": [40.4565, -80.0085], "north shore": [40.4468, -80.0105], "east hills": [40.4558, -79.8766],
  "swissvale": [40.4237, -79.8828], "mount washington": [40.4317, -80.0085], "mt washington": [40.4317, -80.0085], "strip district": [40.4512, -79.9788],
  "lawrenceville": [40.4672, -79.9583], "shadyside": [40.4545, -79.9330], "squirrel hill": [40.4382, -79.9231], "oakland": [40.4413, -79.9562],
  "south side": [40.4284, -79.9764], "south side flats": [40.4284, -79.9764], "bloomfield": [40.4612, -79.9490], "east liberty": [40.4633, -79.9260],
  "polish hill": [40.4590, -79.9640], "highland park": [40.4810, -79.9170], "regent square": [40.4322, -79.8977], "wilkinsburg": [40.4417, -79.8820],
  "penn hills": [40.4740, -79.8350], "brookline": [40.3943, -80.0170], "dormont": [40.3960, -80.0330], "bellevue": [40.4940, -80.0520],
  "millvale": [40.4801, -79.9780], "troy hill": [40.4612, -79.9851], "manchester": [40.4575, -80.0233], "allegheny west": [40.4523, -80.0170],
  "mexican war streets": [40.4580, -80.0111], "greenfield": [40.4239, -79.9374], "hazelwood": [40.4070, -79.9450], "point breeze": [40.4453, -79.9050],
  "friendship": [40.4600, -79.9370], "garfield": [40.4652, -79.9400], "morningside": [40.4790, -79.9330], "carrick": [40.3960, -79.9860],
  "beechview": [40.4100, -80.0260], "west end": [40.4430, -80.0330], "edgewood": [40.4320, -79.8820], "forest hills": [40.4195, -79.8500],
  "homestead": [40.4059, -79.9119], "west mifflin": [40.3634, -79.8664], "mckees rocks": [40.4656, -80.0656], "sharpsburg": [40.4948, -79.9264],
  "etna": [40.5040, -79.9490], "crafton": [40.4351, -80.0662], "green tree": [40.4117, -80.0456], "bethel park": [40.3276, -80.0395],
  "monroeville": [40.4212, -79.7881], "robinson": [40.4596, -80.1567], "cranberry": [40.6845, -80.1070], "indiana county": [40.6215, -79.1525],
};

/** Town centers, for listings whose address and area haven't been found on the map yet. */
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

export function approxPosition(p: { id: string; lat: number | null; lng: number | null; city: string; area?: string }): [number, number] | null {
  const key = (s?: string) => (s || "").trim().toLowerCase();
  const base: [number, number] | undefined = p.lat !== null && p.lng !== null ? [p.lat, p.lng] : AREA_CENTERS[key(p.area)] ?? AREA_CENTERS[key(p.city)] ?? TOWN_CENTERS[key(p.city)];
  if (!base) return null;
  const h = hash(p.id);
  const angle = ((h % 3600) / 3600) * 2 * Math.PI;
  const meters = 150 + ((h >>> 12) % 200);
  const dLat = (meters * Math.cos(angle)) / 111_320;
  const dLng = (meters * Math.sin(angle)) / (111_320 * Math.cos((base[0] * Math.PI) / 180));
  return [Math.round((base[0] + dLat) * 1e5) / 1e5, Math.round((base[1] + dLng) * 1e5) / 1e5];
}

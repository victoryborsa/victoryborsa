/** Amenities grouped the way guests scan them. Keys are stored on listings, so never rename a key. */
export const AMENITY_GROUPS: { name: string; items: Record<string, string> }[] = [
  { name: "Bedroom & laundry", items: { linens: "Bed linens", pillows: "Extra pillows", blankets: "Extra blankets", storage: "Clothing storage", hangers: "Hangers", iron: "Iron & ironing board", washer: "Washer", dryer: "Dryer", drying_rack: "Drying rack" } },
  { name: "Bathroom", items: { hot_water: "Hot water", towels: "Towels", toilet_paper: "Toilet paper", hand_soap: "Hand soap", shampoo: "Shampoo", conditioner: "Conditioner", body_wash: "Body wash", hair_dryer: "Hair dryer", bathtub: "Bathtub" } },
  { name: "Heating & cooling", items: { ac: "Air conditioning", heating: "Heating", ceiling_fan: "Ceiling fan", portable_fan: "Portable fan" } },
  { name: "Internet & workspace", items: { wifi: "Wi-Fi", workspace: "Dedicated workspace", desk: "Desk", desk_chair: "Comfortable chair" } },
  { name: "Entertainment", items: { tv: "TV", smart_tv: "Smart TV", streaming: "Streaming services", books: "Books", board_games: "Board games" } },
  { name: "Kitchen & dining", items: { kitchen: "Full kitchen", fridge: "Refrigerator", freezer: "Freezer", stove: "Stove", oven: "Oven", microwave: "Microwave", dishwasher: "Dishwasher", coffee_maker: "Coffee maker", kettle: "Kettle", toaster: "Toaster", rice_cooker: "Rice cooker", cookware: "Pots & pans", utensils: "Cooking utensils", dishes: "Plates, bowls & cups", silverware: "Silverware", wine_glasses: "Wine glasses", dining_table: "Dining table" } },
  { name: "Home safety", items: { smoke_alarm: "Smoke alarm", co_alarm: "Carbon monoxide alarm", extinguisher: "Fire extinguisher", first_aid: "First aid kit" } },
  { name: "Parking & access", items: { free_street: "Free street parking", free_driveway: "Free driveway parking", garage: "Private garage", paid_parking: "Paid parking", ev: "EV charger", private_entrance: "Private entrance", parking: "Free parking" } },
  { name: "Outdoor", items: { patio: "Patio", balcony: "Balcony", porch: "Porch", backyard: "Backyard", deck: "Deck", outdoor_furniture: "Outdoor furniture", outdoor_dining: "Outdoor dining area", grill: "Barbecue grill", firepit: "Fire pit" } },
  { name: "Family", items: { crib: "Crib", travel_crib: "Travel crib", high_chair: "High chair", safety_gates: "Baby safety gates", kids_toys: "Children's books & toys", kids_dinnerware: "Children's dinnerware" } },
  { name: "Check-in & services", items: { selfcheckin: "Self check-in", smart_lock: "Smart lock", keypad: "Keypad (door code)", lockbox: "Lockbox", luggage_dropoff: "Luggage drop-off allowed", long_term: "Long-term stays allowed", cleaning_during: "Cleaning during stay", pets: "Pets allowed" } },
  { name: "Special features", items: { pool: "Pool", hottub: "Hot tub", fireplace: "Fireplace", gym: "Gym", waterfront: "Waterfront access", lakeaccess: "Lake access", waterview: "Water view" } },
];

export const AMENITIES: Record<string, string> = Object.assign({}, ...AMENITY_GROUPS.map(g => g.items));

/** Search filters. A listing matches if it has any of the keys. */
export const AMENITY_FILTERS: Record<string, { label: string; keys: string[] }> = {
  hottub: { label: "Hot tub", keys: ["hottub"] },
  pool: { label: "Pool", keys: ["pool"] },
  fireplace: { label: "Fireplace", keys: ["fireplace"] },
  wifi: { label: "Wi-Fi", keys: ["wifi"] },
  kitchen: { label: "Kitchen", keys: ["kitchen", "stove", "oven"] },
  parking: { label: "Free parking", keys: ["free_street", "free_driveway", "garage", "parking"] },
  washer: { label: "Washer", keys: ["washer"] },
  workspace: { label: "Workspace", keys: ["workspace", "desk"] },
  ac: { label: "Air conditioning", keys: ["ac"] },
  pets: { label: "Pets allowed", keys: ["pets"] },
  family: { label: "Crib or travel crib", keys: ["crib", "travel_crib"] },
  selfcheckin: { label: "Self check-in", keys: ["selfcheckin", "smart_lock", "keypad", "lockbox"] },
  water: { label: "Water view or access", keys: ["waterview", "waterfront", "lakeaccess"] },
};

export const MATTRESS_SIZES: Record<string, string> = {
  twin: "Twin / Single (38 × 75 in)",
  twin_xl: "Twin XL (38 × 80 in)",
  full: "Full / Double (54 × 75 in)",
  queen: "Queen (60 × 80 in)",
  king: "King (76 × 80 in)",
  cal_king: "California King (72 × 84 in)",
};
export const SLEEPING_OPTIONS: Record<string, string> = {
  bed: "Bed",
  sofa_bed: "Sofa bed",
  bunk_bed: "Bunk bed",
  daybed: "Daybed",
  trundle: "Trundle bed",
  air_mattress: "Air mattress",
  crib: "Crib",
};
export type BedItem = { kind: string; size: string; count: number };
const SHORT_SIZE: Record<string, string> = { twin: "Twin", twin_xl: "Twin XL", full: "Full", queen: "Queen", king: "King", cal_king: "California King" };
/** "2 Queen beds", "1 Sofa bed (Full)", "1 Crib" */
export function bedLabel(b: BedItem): string {
  const n = b.count;
  if (b.kind === "bed") return `${n} ${SHORT_SIZE[b.size] || ""} bed${n > 1 ? "s" : ""}`.replace("  ", " ");
  if (b.kind === "crib") return `${n} crib${n > 1 ? "s" : ""}`;
  const name = (SLEEPING_OPTIONS[b.kind] || "Bed").toLowerCase();
  return `${n} ${name}${n > 1 ? "s" : ""}${SHORT_SIZE[b.size] ? ` (${SHORT_SIZE[b.size]})` : ""}`;
}
export function parseBeds(raw: unknown): BedItem[] {
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr
      .map(b => ({ kind: String(b.kind), size: String(b.size || ""), count: Math.min(20, Math.max(1, Math.round(Number(b.count) || 1))) }))
      .filter(b => b.kind in SLEEPING_OPTIONS && (b.size === "" || b.size in MATTRESS_SIZES))
      .slice(0, 20);
  } catch {
    return [];
  }
}

export const ACCESS: Record<string, string> = { private: "Private", shared: "Shared with other guests", none: "Not available" };

export const PROPERTY_TYPES: Record<string, string> = {
  house: "House", apartment: "Apartment", condo: "Condo", cabin: "Cabin", cottage: "Cottage", townhouse: "Townhouse", farmhouse: "Farmhouse", lodge: "Lodge", suite: "Private suite", room: "Private room",
};

export const CANCELLATION: Record<string, { label: string; text: string }> = {
  flexible: { label: "Flexible", text: "Cancel up to 24 hours before check-in at no cost." },
  moderate: { label: "Moderate", text: "Cancel at least 5 days before check-in at no cost. After that, the first night is owed." },
  firm: { label: "Firm", text: "Cancel at least 30 days before check-in at no cost. Between 30 and 7 days, half the stay is owed. Within 7 days, the full stay is owed." },
};

export const ROLES = ["customer", "host", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const BOOKING_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  pending: { label: "Awaiting host", tone: "warn" },
  awaiting_payment: { label: "Awaiting payment", tone: "warn" },
  confirmed: { label: "Confirmed", tone: "ok" },
  declined: { label: "Declined", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
};

/** Requests the host hasn't answered within this many hours expire and release the dates. */
export const REQUEST_EXPIRY_HOURS = 48;

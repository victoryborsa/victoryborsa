export const AMENITIES: Record<string, string> = {
  wifi: "Wi-Fi",
  kitchen: "Full kitchen",
  ac: "Air conditioning",
  heating: "Heating",
  parking: "Free parking",
  washer: "Washer & dryer",
  workspace: "Dedicated workspace",
  tv: "TV",
  hottub: "Hot tub",
  pool: "Pool",
  fireplace: "Fireplace",
  firepit: "Fire pit",
  grill: "Grill",
  deck: "Deck or patio",
  waterview: "Water view",
  lakeaccess: "Lake access",
  pets: "Pets allowed",
  crib: "Crib",
  ev: "EV charger",
  gym: "Gym",
  selfcheckin: "Self check-in",
};

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
  confirmed: { label: "Confirmed", tone: "ok" },
  declined: { label: "Declined", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
};

/** Requests the host hasn't answered within this many hours expire and release the dates. */
export const REQUEST_EXPIRY_HOURS = 48;

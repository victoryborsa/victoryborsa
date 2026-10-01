"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { one, q, tx } from "@/lib/db.ts";
import { requireUser, safeNext, type User } from "@/lib/auth.ts";
import { withMsg } from "@/components/Flash.tsx";
import { requireManageable } from "@/lib/access.ts";
import { addBlock, setBookingStatus, type Booking } from "@/lib/bookings.ts";
import { ACCESS, AMENITIES, CANCELLATION, PROPERTY_TYPES, parseBeds, parseRooms, parseServices } from "@/lib/constants.ts";
import { int, lines, slugify, str, type ActionState } from "@/lib/validate.ts";
import { toCents } from "@/lib/money.ts";
import { processPhoto } from "@/lib/photos.ts";
import { syncFeed } from "@/lib/calendar-sync.ts";
import { getSettings } from "@/lib/settings.ts";
import { isOnline } from "@/lib/payments.ts";
import { bookingInfo, notifyBooking, recordPayment } from "@/lib/payment-flow.ts";
import { fetchPublic } from "@/lib/safe-fetch.ts";
import { moveListingFamily } from "@/lib/homes.ts";
import { feePayText, feeState, type FeeRow } from "@/lib/listing-fee.ts";
import { sendEmail, siteUrl } from "@/lib/email.ts";
import { logEvent } from "@/lib/log.ts";
import { fmtDate, todayLocal } from "@/lib/dates.ts";

// ---------- Listings ----------

const pct = (fd: FormData, k: string) => { const n = Number(str(fd, k) || 0); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };

function readListing(fd: FormData) {
  const beds = parseBeds(str(fd, "beds_json", 5000));
  const baseOcc = str(fd, "base_occupancy");
  const v = {
    title: str(fd, "title", 120), property_type: str(fd, "property_type", 30), city: str(fd, "city", 80), area: str(fd, "area", 80), address: str(fd, "address", 300),
    description: str(fd, "description", 8000), max_guests: int(fd, "max_guests"), bedrooms: int(fd, "bedrooms"), bathrooms: int(fd, "bathrooms"), half_bathrooms: int(fd, "half_bathrooms"),
    nightly: toCents(str(fd, "nightly_price")), cleaning: toCents(str(fd, "cleaning_fee") || "0"), min_nights: int(fd, "min_nights"), max_nights: int(fd, "max_nights"),
    booking_mode: str(fd, "booking_mode"), cancellation_policy: str(fd, "cancellation_policy"), check_in_time: str(fd, "check_in_time", 30), check_out_time: str(fd, "check_out_time", 30),
    amenities: fd.getAll("amenities").map(String).filter(a => a in AMENITIES), house_rules: lines(str(fd, "house_rules", 5000)), arrival_instructions: str(fd, "arrival_instructions", 5000),
    status: str(fd, "status"),
    parent_id: str(fd, "listing_kind") === "room" ? str(fd, "parent_id", 40) || null : null,
    bathroom_type: str(fd, "bathroom_type") === "shared" ? "shared" : "private",
    beds_detail: beds,
    // Sleeping spots, not counting cribs.
    beds: beds.filter(b => b.kind !== "crib").reduce((n, b) => n + b.count, 0),
    kitchen_access: str(fd, "kitchen_access"), laundry_access: str(fd, "laundry_access"), stairs_info: str(fd, "stairs_info", 300), shared_spaces: str(fd, "shared_spaces", 400),
    has_exterior_cameras: fd.get("has_exterior_cameras") === "on", camera_locations: str(fd, "camera_locations", 300),
    base_occupancy: baseOcc === "" ? null : Number(baseOcc), extra_guest_fee: toCents(str(fd, "extra_guest_fee") || "0"),
    fewer_guest_discount_percent: pct(fd, "fewer_guest_discount_percent"), weekly_discount_percent: pct(fd, "weekly_discount_percent"), monthly_discount_percent: pct(fd, "monthly_discount_percent"),
    children_free_age: int(fd, "children_free_age"),
    management_fee_percent: fd.has("management_fee_percent") ? pct(fd, "management_fee_percent") : null,
    owner_zelle: str(fd, "owner_zelle", 120), owner_venmo: str(fd, "owner_venmo", 60),
    rooms: parseRooms(str(fd, "rooms_json", 30000) || "[]"),
    services: parseServices(str(fd, "services_json", 20000) || "[]"),
    deposit: toCents(str(fd, "security_deposit") || "0"),
    pet_fee: fd.getAll("amenities").includes("pets") && str(fd, "pet_fee_mode") === "fee" ? toCents(str(fd, "pet_fee") || "0") : 0,
    pet_fee_per: str(fd, "pet_fee_per") || "stay",
    smart_pricing: fd.get("smart_pricing") === "on",
    min_price: str(fd, "min_price") ? toCents(str(fd, "min_price")) : null,
    max_price: str(fd, "max_price") ? toCents(str(fd, "max_price")) : null,
  };
  let error = "";
  if (!v.title) error = "Give the listing a title.";
  else if (fd.getAll("amenities").includes("pets") && str(fd, "pet_fee_mode") === "fee" && !(Number.isFinite(v.pet_fee) && (v.pet_fee as number) > 0)) error = "Add the pet fee amount, or choose Free.";
  else if (!["stay", "night", "pet_stay", "pet_night"].includes(v.pet_fee_per)) error = "Choose how the pet fee is charged.";
  else if (!(Number.isFinite(v.deposit) && (v.deposit as number) >= 0)) error = "Enter the security deposit as a number, or 0.";
  else if (v.smart_pricing && !(v.min_price && v.max_price && v.min_price > 0 && v.max_price > 0)) error = "Smart pricing needs a lowest and a highest price per night.";
  else if (v.smart_pricing && v.min_price! > v.max_price!) error = "The lowest price per night can't be higher than the highest.";
  else if ((v.min_price !== null && !(v.min_price > 0)) || (v.max_price !== null && !(v.max_price > 0))) error = "Enter the minimum and maximum prices as numbers.";
  else if (!v.city) error = "Add the town or city.";
  else if (!(v.property_type in PROPERTY_TYPES)) error = "Choose a property type.";
  else if (!(v.max_guests >= 1 && v.max_guests <= 50)) error = "Maximum guests must be between 1 and 50.";
  else if (!(v.bedrooms >= 0 && v.bedrooms <= 30)) error = "Bedrooms must be between 0 and 30.";
  else if (!(v.bathrooms >= 0 && v.bathrooms <= 20)) error = "Full bathrooms must be a whole number between 0 and 20.";
  else if (!(v.half_bathrooms >= 0 && v.half_bathrooms <= 10)) error = "Half bathrooms must be a whole number between 0 and 10.";
  else if (!v.nightly || v.nightly < 1000) error = "Nightly price must be at least $10.";
  else if (v.cleaning === null) error = "Cleaning fee must be a number (use 0 for none).";
  else if (!(v.min_nights >= 1 && v.min_nights <= 60)) error = "Minimum nights must be between 1 and 60.";
  else if (!(v.max_nights >= v.min_nights && v.max_nights <= 365)) error = "Maximum nights must be at least the minimum, and at most 365.";
  else if (!["instant", "request"].includes(v.booking_mode)) error = "Choose how guests book.";
  else if (!(v.cancellation_policy in CANCELLATION)) error = "Choose a cancellation policy.";
  else if (!(v.kitchen_access in ACCESS) || !(v.laundry_access in ACCESS)) error = "Choose whether the kitchen and laundry are private, shared, or not available.";
  else if (v.has_exterior_cameras && v.camera_locations.length < 3) error = "Say where the exterior cameras are. Guests must be told before they book.";
  else if (v.base_occupancy !== null && !(Number.isInteger(v.base_occupancy) && v.base_occupancy >= 1 && v.base_occupancy <= v.max_guests)) error = "Base occupancy must be between 1 and the maximum guests.";
  else if (v.extra_guest_fee === null) error = "Extra guest fee must be a number (use 0 for none).";
  else if (!(v.fewer_guest_discount_percent >= 0 && v.fewer_guest_discount_percent <= 50)) error = "Smaller group discount must be between 0% and 50%.";
  else if (!(v.weekly_discount_percent >= 0 && v.weekly_discount_percent <= 80 && v.monthly_discount_percent >= 0 && v.monthly_discount_percent <= 80)) error = "Weekly and monthly discounts must be between 0% and 80%.";
  else if (!(v.children_free_age >= 0 && v.children_free_age <= 17)) error = "The free age for children must be between 0 and 17.";
  else if (v.management_fee_percent !== null && !(v.management_fee_percent >= 0 && v.management_fee_percent <= 100)) error = "Management fee must be between 0% and 100%.";
  else if (!["draft", "published", "hidden"].includes(v.status)) error = "Choose whether the listing is visible.";
  else if (v.status === "published" && v.description.length < 40) error = "Add a description of at least a couple of sentences before publishing.";
  return { v, error };
}

type ListingValues = ReturnType<typeof readListing>["v"];
/** Column → value for the listing fields the form edits. */
function listingColumns(v: ListingValues, isAdmin: boolean): Record<string, unknown> {
  const cols: Record<string, unknown> = {
    title: v.title, property_type: v.property_type, city: v.city, area: v.area, address: v.address, description: v.description, max_guests: v.max_guests,
    bedrooms: v.bedrooms, beds: v.beds, bathrooms: v.bathrooms, half_bathrooms: v.half_bathrooms, nightly_price_cents: v.nightly, cleaning_fee_cents: v.cleaning,
    min_nights: v.min_nights, max_nights: v.max_nights, booking_mode: v.booking_mode, cancellation_policy: v.cancellation_policy,
    check_in_time: v.check_in_time || "3:00 pm", check_out_time: v.check_out_time || "11:00 am", amenities: v.amenities, house_rules: v.house_rules,
    arrival_instructions: v.arrival_instructions, parent_id: v.parent_id, bathroom_type: v.bathroom_type, beds_detail: JSON.stringify(v.beds_detail),
    kitchen_access: v.kitchen_access, laundry_access: v.laundry_access, stairs_info: v.stairs_info, shared_spaces: v.shared_spaces, has_exterior_cameras: v.has_exterior_cameras,
    camera_locations: v.has_exterior_cameras ? v.camera_locations : "", base_occupancy: v.base_occupancy, extra_guest_fee_cents: v.extra_guest_fee,
    fewer_guest_discount_percent: v.fewer_guest_discount_percent, weekly_discount_percent: v.weekly_discount_percent, monthly_discount_percent: v.monthly_discount_percent,
    children_free_age: v.children_free_age, owner_zelle: v.owner_zelle, owner_venmo: v.owner_venmo,
    pet_fee_cents: v.pet_fee || 0, pet_fee_per: v.pet_fee_per,
    rooms_detail: JSON.stringify(v.rooms), services: JSON.stringify(v.services), security_deposit_cents: v.deposit || 0,
    smart_pricing: v.smart_pricing, min_price_cents: v.min_price, max_price_cents: v.max_price,
  };
  // Only admins set the management fee; hosts never see or change it.
  if (isAdmin && v.management_fee_percent !== null) cols.management_fee_percent = v.management_fee_percent;
  return cols;
}

/** Checks a "part of" link: the whole home must exist, belong to the same host, and not itself be part of another home. */
async function parentProblem(parentId: string | null, hostId: string, selfId?: string): Promise<string | null> {
  if (!parentId) return null;
  if (parentId === selfId) return "A listing can't be part of itself.";
  const parent = await one<{ host_id: string; parent_id: string | null }>("SELECT host_id, parent_id FROM properties WHERE id = $1", [parentId]);
  if (!parent) return "Choose the whole-home listing this room belongs to.";
  if (parent.host_id !== hostId) return "The whole-home listing must belong to the same host.";
  if (parent.parent_id) return "That listing is itself a room. Choose the whole-home listing instead.";
  if (selfId) {
    const hasRooms = await one("SELECT 1 FROM properties WHERE parent_id = $1", [selfId]);
    if (hasRooms) return "This listing has rooms linked to it, so it can't also be a room of another home.";
    const clash = await one<{ a: string; b: string }>(
      `SELECT a.code AS a, b.code AS b FROM bookings a JOIN bookings b ON b.property_id = $2
       WHERE a.property_id = $1 AND a.status IN ('pending','awaiting_payment','confirmed') AND b.status IN ('pending','awaiting_payment','confirmed') AND a.check_in < b.check_out AND b.check_in < a.check_out LIMIT 1`,
      [selfId, parentId],
    );
    if (clash) return `Bookings ${clash.a} and ${clash.b} overlap, so these listings can't be linked until one is changed or cancelled.`;
  }
  return null;
}

/** Creates a draft listing from form fields. Not exported: callers must check the user first. */
async function createListingCore(u: User, fd: FormData): Promise<{ id: string } | { error: string }> {
  const { v, error } = readListing(fd);
  if (error) return { error };
  // Admins can create a listing on behalf of a host.
  let hostId = u.id;
  if (u.role === "admin" && str(fd, "host_id")) {
    const h = await one<{ id: string }>("SELECT id FROM users WHERE id = $1 AND role IN ('host','admin')", [str(fd, "host_id")]);
    if (!h) return { error: "Choose a host for this listing." };
    hostId = h.id;
  }
  const pErr = await parentProblem(v.parent_id, hostId);
  if (pErr) return { error: pErr };
  let slug = slugify(`${v.title} ${v.city}`);
  if (await one("SELECT 1 FROM properties WHERE slug = $1", [slug])) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const cols = { ...listingColumns(v, u.role === "admin"), slug, host_id: hostId, status: "draft" };
  const names = Object.keys(cols);
  const row = await one<{ id: string }>(
    `INSERT INTO properties (${names.join(", ")}) VALUES (${names.map((_, i) => "$" + (i + 1)).join(", ")}) RETURNING id`,
    Object.values(cols),
  );
  await logEvent("info", "Listings", `Listing created: ${v.title}`, {}, u.id);
  return { id: row!.id };
}

export async function createListingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser(["host", "admin"]);
  const r = await createListingCore(u, fd);
  if ("error" in r) return { error: r.error };
  redirect(`/host/listings/${r.id}/photos?created=1`);
}

// ---------- Import ----------

type ImportItem = Record<string, unknown>;
const IMPORT_FIELDS: Record<string, string> = {
  // import key → form field name (the rest share the same name)
  nightly_price: "nightly_price", cleaning_fee: "cleaning_fee", extra_guest_fee: "extra_guest_fee",
};

/** Turns one imported listing into the same form fields the listing editor sends, so it goes through the same checks. */
function importToForm(item: ImportItem, parentId: string | null, hostId: string): FormData {
  const fd = new FormData();
  const set = (k: string, v: unknown) => { if (v !== undefined && v !== null) fd.set(k, String(v)); };
  const plain = ["title", "property_type", "city", "area", "address", "description", "max_guests", "bedrooms", "bathrooms", "half_bathrooms", "bathroom_type",
    "kitchen_access", "laundry_access", "stairs_info", "shared_spaces", "camera_locations", "min_nights", "max_nights", "booking_mode", "cancellation_policy", "check_in_time",
    "check_out_time", "arrival_instructions", "base_occupancy", "fewer_guest_discount_percent", "weekly_discount_percent", "monthly_discount_percent",
    "children_free_age", "management_fee_percent", "owner_zelle", "owner_venmo", "pet_fee_per", ...Object.keys(IMPORT_FIELDS)];
  for (const k of plain) set(IMPORT_FIELDS[k] || k, item[k]);
  const isRoom = item.listing_kind === "room" || item.property_type === "room";
  fd.set("listing_kind", isRoom ? "room" : "home");
  if (isRoom) fd.set("property_type", "room");
  if (parentId) fd.set("parent_id", parentId);
  fd.set("status", "draft");
  fd.set("host_id", hostId);
  // Defaults for anything the file leaves out.
  for (const [k, v] of Object.entries({ bedrooms: 1, bathrooms: 1, half_bathrooms: 0, bathroom_type: "private", kitchen_access: "private", laundry_access: "none",
    min_nights: 1, max_nights: 30, booking_mode: "instant", cancellation_policy: "moderate", check_in_time: "3:00 pm", check_out_time: "11:00 am",
    cleaning_fee: 0, extra_guest_fee: 0, fewer_guest_discount_percent: 0, weekly_discount_percent: 0, monthly_discount_percent: 0, children_free_age: 2 }))
    if (!fd.has(k)) fd.set(k, String(v));
  if (item.has_exterior_cameras) fd.set("has_exterior_cameras", "on");
  if (Number(item.pet_fee) > 0) { fd.set("pet_fee_mode", "fee"); fd.set("pet_fee", String(item.pet_fee)); }
  if (Array.isArray(item.beds)) fd.set("beds_json", JSON.stringify(item.beds));
  if (Array.isArray(item.rooms)) fd.set("rooms_json", JSON.stringify(item.rooms));
  if (Array.isArray(item.services)) fd.set("services_json", JSON.stringify(item.services));
  if (item.security_deposit) fd.set("security_deposit", String(item.security_deposit));
  for (const a of Array.isArray(item.amenities) ? item.amenities : []) fd.append("amenities", String(a));
  const rules = Array.isArray(item.house_rules) ? item.house_rules.join("\n") : String(item.house_rules ?? "");
  fd.set("house_rules", rules);
  return fd;
}

async function importPhotos(propertyId: string, urls: string[]): Promise<{ added: number; failed: number }> {
  let added = 0, failed = 0;
  for (const [i, url] of urls.slice(0, 40).entries()) {
    try {
      const res = await fetchPublic(url, 20_000);
      if (!res.ok) throw new Error(String(res.status));
      const buf = await res.arrayBuffer();
      const r = await processPhoto(new File([buf], `photo-${i + 1}.jpg`, { type: res.headers.get("content-type") || "image/jpeg" }));
      if ("error" in r) throw new Error(r.error);
      await q("INSERT INTO photos (property_id, position, large, thumb, width, height) VALUES ($1, $2, $3, $4, $5, $6)", [propertyId, added, r.large, r.thumb, r.width, r.height]);
      added++;
    } catch {
      failed++;
    }
  }
  return { added, failed };
}

/**
 * Imports one or more listings from a JSON file as drafts. A house and its rooms can come in one file:
 * rooms name their house with "part_of" (the house's title, from this file or an existing listing).
 */
export async function importListingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser(["host", "admin"]);
  let text = str(fd, "json", 500_000);
  const file = fd.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 500_000) return { error: "That file is too big for a listing import." };
    text = await file.text();
  }
  if (!text) return { error: "Choose the listing file (.json) to import, or paste its contents." };
  let items: ImportItem[];
  try {
    const parsed = JSON.parse(text);
    items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.listings) ? parsed.listings : [parsed];
  } catch {
    return { error: "That file isn't a listing file. It should be the .json file Claude made for you." };
  }
  if (!items.length || items.length > 30) return { error: "A file can hold between 1 and 30 listings." };

  let hostId = u.id;
  if (u.role === "admin" && str(fd, "host_id")) {
    const h = await one<{ id: string }>("SELECT id FROM users WHERE id = $1 AND role IN ('host','admin')", [str(fd, "host_id")]);
    if (!h) return { error: "Choose a host for these listings." };
    hostId = h.id;
  }
  // Whole homes first, so rooms can link to them.
  const ordered = [...items].sort((a, b) => Number(!!a.part_of) - Number(!!b.part_of));
  const created: { title: string; id: string }[] = [];
  const problems: string[] = [];
  let photos = 0, photoFails = 0;
  for (const item of ordered) {
    const title = String(item.title || "Untitled");
    let parentId: string | null = null;
    if (item.part_of) {
      const name = String(item.part_of);
      parentId = created.find(c => c.title === name)?.id
        ?? (await one<{ id: string }>("SELECT id FROM properties WHERE host_id = $1 AND parent_id IS NULL AND lower(title) = lower($2) ORDER BY created_at LIMIT 1", [hostId, name]))?.id
        ?? null;
      if (!parentId) { problems.push(`${title}: couldn't find the house "${name}"`); continue; }
    }
    const r = await createListingCore(u, importToForm(item, parentId, hostId));
    if ("error" in r) { problems.push(`${title}: ${r.error}`); continue; }
    created.push({ title, id: r.id });
    const urls = (Array.isArray(item.photo_urls) ? item.photo_urls : []).map(String).filter(x => x.startsWith("https://"));
    if (urls.length) { const p = await importPhotos(r.id, urls); photos += p.added; photoFails += p.failed; }
  }
  revalidatePath("/host/listings");
  revalidatePath("/admin/listings");
  const msg = `Imported ${created.length} listing${created.length === 1 ? "" : "s"} as drafts: ${created.map(c => c.title).join(", ") || "none"}.` +
    (photos || photoFails ? ` Photos added: ${photos}${photoFails ? `, ${photoFails} couldn't be downloaded` : ""}.` : "") +
    " Check each one, add photos, then set Visibility to Published.";
  if (problems.length) return { error: `${msg} Not imported: ${problems.join("; ")}.` };
  return { ok: msg };
}

export async function updateListingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { u, p } = await requireManageable(str(fd, "id", 40));
  const { v, error } = readListing(fd);
  if (error) return { error };
  // Admins can move a listing to another host (owner). A house takes its rooms along so they stay linked.
  const newHost = u.role === "admin" ? str(fd, "host_id", 40) : "";
  let hostId = p.host_id;
  if (newHost && newHost !== p.host_id) {
    const h = await one<{ id: string; name: string }>("SELECT id, name FROM users WHERE id = $1 AND role IN ('host','admin') AND NOT disabled", [newHost]);
    if (!h) return { error: "Choose an active host." };
    hostId = h.id;
  }
  const pErr = v.parent_id !== p.parent_id ? await parentProblem(v.parent_id, hostId, p.id) : null;
  if (pErr) return { error: pErr };
  if (v.status === "published") {
    const photos = await one<{ n: number }>("SELECT count(*) AS n FROM photos WHERE property_id = $1", [p.id]);
    if (!photos || photos.n === 0) return { error: "Add at least one photo before publishing." };
  }
  if (v.status === "published" && p.status !== "published" && u.role !== "admin") {
    const f = await one<FeeRow>("SELECT p.listing_paid_until::text, p.listing_fee_waived, h.role AS host_role FROM properties p JOIN users h ON h.id = p.host_id WHERE p.id = $1", [p.id]);
    const fee = await feePayText();
    if (f && feeState(f, fee.enabled) === "due") return { error: `Your yearly listing fee (${fee.amount}) needs to be paid before this listing can go live. ${fee.how} We'll switch it on once it arrives.` };
  }
  const cols = { ...listingColumns(v, u.role === "admin"), status: v.status, host_id: hostId };
  const names = Object.keys(cols);
  await q(`UPDATE properties SET ${names.map((n, i) => `${n} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`, [p.id, ...Object.values(cols)]);
  let movedNote = "";
  if (hostId !== p.host_id) {
    // A house and its rooms share one host, so the whole linked family moves together.
    const moved = await moveListingFamily(p.id, hostId);
    await logEvent("info", "Listings", `${moved.join(", ")} moved to another host`, { property: p.id, host: hostId }, u.id);
    if (moved.length > 1) movedNote = ` The house and its rooms moved to the new host together (${moved.length} listings).`;
    revalidatePath("/admin/listings");
  }
  if (v.nightly !== p.nightly_price_cents || v.status !== p.status) await logEvent("info", "Listings", `${v.title}: ${v.status !== p.status ? `status ${p.status} → ${v.status}` : ""} ${v.nightly !== p.nightly_price_cents ? `price ${p.nightly_price_cents / 100} → ${v.nightly! / 100}` : ""}`.trim(), { property: p.id }, u.id);
  revalidatePath(`/stays/${p.slug}`);
  return { ok: (v.status === "published" ? "Saved. Changes are live on the site." : "Saved. This listing is not visible to guests.") + movedNote };
}

/** Deletes a listing for good, with its photos and calendar. Listings with real reservations can't be deleted (they are kept for the money records); hide them instead. */
export async function deleteListingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { u, p } = await requireManageable(str(fd, "id", 40));
  if (str(fd, "confirm", 10) !== "yes") return { error: "Tick the box to confirm you want to delete this listing." };
  const kept = await one<{ n: number }>("SELECT count(*)::int AS n FROM bookings WHERE property_id = $1 AND status IN ('pending','awaiting_payment','confirmed')", [p.id]);
  if (kept && kept.n > 0)
    return { error: `This listing has ${kept.n} reservation${kept.n === 1 ? "" : "s"} (upcoming or past), which are kept for your money records. Cancel any test bookings first, or set Status to “Hidden” so guests can't see it.` };
  const rooms = await q<{ title: string }>("SELECT title FROM properties WHERE parent_id = $1", [p.id]);
  await tx(async c => {
    await c.query("DELETE FROM bookings WHERE property_id = $1", [p.id]); // only cancelled, declined or expired ones remain
    await c.query("DELETE FROM properties WHERE id = $1", [p.id]);
  });
  await logEvent("info", "Listings", `Deleted listing ${p.title}${rooms.length ? ` (its rooms are now separate listings: ${rooms.map(r => r.title).join(", ")})` : ""}`, { property: p.id }, u.id);
  revalidatePath("/host/listings");
  revalidatePath("/admin/listings");
  revalidatePath("/stays");
  redirect(withMsg(u.role === "admin" ? "/admin/listings" : "/host/listings", "deleted"));
}

// ---------- Photos ----------

export async function uploadPhotosAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { p } = await requireManageable(str(fd, "id", 40));
  const files = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose one or more photos to upload." };
  if (files.length > 30) return { error: "Upload up to 30 photos at a time." };
  const errors: string[] = [];
  let added = 0;
  const start = (await one<{ m: number }>("SELECT coalesce(max(position), -1) AS m FROM photos WHERE property_id = $1", [p.id]))!.m + 1;
  for (const f of files) {
    const r = await processPhoto(f);
    if ("error" in r) { errors.push(r.error); continue; }
    await q("INSERT INTO photos (property_id, position, large, thumb, width, height) VALUES ($1, $2, $3, $4, $5, $6)", [p.id, start + added, r.large, r.thumb, r.width, r.height]);
    added++;
  }
  revalidatePath(`/host/listings/${p.id}/photos`);
  if (errors.length) return { error: `${added} photo${added === 1 ? "" : "s"} added. ${errors.join(" ")}` };
  return { ok: `${added} photo${added === 1 ? "" : "s"} added.` };
}

export async function photoCommandAction(fd: FormData) {
  const { p } = await requireManageable(str(fd, "id", 40));
  const photoId = str(fd, "photo", 40), cmd = str(fd, "cmd", 20);
  const photos = await q<{ id: string }>("SELECT id FROM photos WHERE property_id = $1 ORDER BY position, created_at", [p.id]);
  const i = photos.findIndex(x => x.id === photoId);
  if (i < 0) return;
  const order = photos.map(x => x.id);
  if (cmd === "delete") order.splice(i, 1);
  if (cmd === "up" && i > 0) [order[i - 1], order[i]] = [order[i], order[i - 1]];
  if (cmd === "down" && i < order.length - 1) [order[i + 1], order[i]] = [order[i], order[i + 1]];
  if (cmd === "cover") { order.splice(i, 1); order.unshift(photoId); }
  await tx(async c => {
    if (cmd === "delete") await q("DELETE FROM photos WHERE id = $1 AND property_id = $2", [photoId, p.id], c);
    for (const [pos, id] of order.entries()) await q("UPDATE photos SET position = $2 WHERE id = $1", [id, pos], c);
  });
  if (cmd === "delete" && order.length === 0 && p.status === "published") {
    await q("UPDATE properties SET status = 'hidden' WHERE id = $1", [p.id]);
  }
  revalidatePath(`/host/listings/${p.id}/photos`);
}

export async function captionAction(fd: FormData) {
  const { p } = await requireManageable(str(fd, "id", 40));
  await q("UPDATE photos SET caption = $3 WHERE id = $1 AND property_id = $2", [str(fd, "photo", 40), p.id, str(fd, "caption", 140)]);
  revalidatePath(`/host/listings/${p.id}/photos`);
}

// ---------- Calendar ----------

export async function addBlockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { u, p } = await requireManageable(str(fd, "id", 40));
  const start = str(fd, "start", 10), end = str(fd, "end", 10);
  if (start < todayLocal()) return { error: "Choose dates from today onwards." };
  const r = await addBlock(p.id, start, end, str(fd, "note", 120) || "Blocked by host");
  if (!r.ok) return { error: r.error };
  await logEvent("info", "Calendar", `Blocked ${start} to ${end} on ${p.title}`, {}, u.id);
  revalidatePath(`/host/listings/${p.id}/calendar`);
  return { ok: `Blocked ${fmtDate(start)} to ${fmtDate(end)}. Guests can't book those nights.` };
}

export async function removeBlockAction(fd: FormData) {
  const { p } = await requireManageable(str(fd, "id", 40));
  await q("DELETE FROM blocks WHERE id = $1 AND property_id = $2 AND source = 'host'", [str(fd, "block", 40), p.id]);
  revalidatePath(`/host/listings/${p.id}/calendar`);
}

export async function addFeedAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { p } = await requireManageable(str(fd, "id", 40));
  const name = str(fd, "name", 60) || "Other calendar", url = str(fd, "url", 1000);
  if (!/^https:\/\/[^\s]+$/i.test(url)) return { error: "Paste the full calendar link. It starts with https://" };
  const feed = await one<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, $2, $3) RETURNING id", [p.id, name, url]);
  const res = await syncFeed(feed!.id);
  revalidatePath(`/host/listings/${p.id}/calendar`);
  return res.error ? { error: `Saved, but the first import failed: ${res.error}` } : { ok: `Imported ${res.count} booked period${res.count === 1 ? "" : "s"} from ${name}.` };
}

export async function syncFeedAction(fd: FormData) {
  const { p } = await requireManageable(str(fd, "id", 40));
  const feed = await one<{ id: string }>("SELECT id FROM ical_feeds WHERE id = $1 AND property_id = $2", [str(fd, "feed", 40), p.id]);
  if (feed) await syncFeed(feed.id);
  revalidatePath(`/host/listings/${p.id}/calendar`);
}

export async function removeFeedAction(fd: FormData) {
  const { p } = await requireManageable(str(fd, "id", 40));
  const feedId = str(fd, "feed", 40);
  await q("DELETE FROM blocks WHERE property_id = $1 AND source = $2", [p.id, "ical:" + feedId]);
  await q("DELETE FROM ical_feeds WHERE id = $1 AND property_id = $2", [feedId, p.id]);
  revalidatePath(`/host/listings/${p.id}/calendar`);
}

// ---------- Bookings ----------

type BookingWithInfo = Booking & { title: string; host_id: string; guest_email: string };
async function manageableBooking(id: string) {
  const u = await requireUser(["host", "admin"]);
  const b = await one<BookingWithInfo>("SELECT b.*, p.title, p.host_id, g.email AS guest_email FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.guest_id WHERE b.id = $1", [id]);
  if (!b || (u.role !== "admin" && b.host_id !== u.id)) return { u, b: null };
  return { u, b };
}

export async function decideBookingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { u, b } = await manageableBooking(str(fd, "id", 40));
  if (!b) return { error: "You can't manage this booking." };
  const decision = str(fd, "decision"), note = str(fd, "note", 1000);
  const back = safeNext(str(fd, "back", 300), "/host/bookings");
  const dates = `${fmtDate(b.check_in)} – ${fmtDate(b.check_out)}`;
  if (decision === "accept") {
    // With payments on, an accepted request waits for the guest's payment; otherwise it's confirmed now.
    const needsPay = !!b.payment_method;
    const settings = await getSettings();
    const hours = isOnline(b.payment_method) ? 24 : settings.manual_payment_hours;
    const r = await one<Booking>(
      `UPDATE bookings SET status = $2, host_note = coalesce($3, host_note), payment_deadline = $4, updated_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`,
      [b.id, needsPay ? "awaiting_payment" : "confirmed", note || null, needsPay ? new Date(Date.now() + hours * 3600_000).toISOString() : null],
    );
    if (!r) return { error: "This request was already answered or has expired." };
    const info = await bookingInfo(b.id);
    if (info) {
      if (note) await sendEmail(b.guest_email, `Your request was accepted: ${b.title}`, `Good news! Your request to stay at ${b.title} for ${dates} was accepted.\n\nNote from the host: ${note}`);
      await notifyBooking(info);
    }
    await logEvent("info", "Bookings", `Request ${b.code} accepted`, {}, u.id);
    redirect(withMsg(back, "accepted"));
  }
  if (decision === "decline") {
    const r = await setBookingStatus(b.id, ["pending"], "declined", { hostNote: note || undefined });
    if (!r) return { error: "This request was already answered or has expired." };
    await sendEmail(b.guest_email, `Update on your request: ${b.title}`, `Unfortunately the host can't accept your request for ${b.title} (${dates}).${note ? "\n\nNote from the host: " + note : ""}\n\nNothing is owed. Find another stay: ${siteUrl()}/stays`);
    await logEvent("info", "Bookings", `Request ${b.code} declined`, {}, u.id);
    redirect(withMsg(back, "declined"));
  }
  if (decision === "cancel") {
    if (note.length < 5) return { error: "Add a short reason for the guest. It's included in the cancellation email." };
    const r = await setBookingStatus(b.id, ["pending", "awaiting_payment", "confirmed"], "cancelled", { cancelledBy: u.role === "admin" ? "admin" : "host", hostNote: note });
    if (!r) return { error: "This booking is already cancelled or finished." };
    await sendEmail(b.guest_email, `Your booking was cancelled: ${b.title}`, `We're sorry. Your booking ${b.code} at ${b.title} for ${dates} has been cancelled.\n\nReason: ${note}\n\nPlease contact us if you have questions: ${siteUrl()}/contact`);
    await logEvent("warn", "Bookings", `Booking ${b.code} cancelled by ${u.role}`, { reason: note }, u.id);
    redirect(withMsg(back, "cancelled"));
  }
  return { error: "Choose accept, decline or cancel." };
}

// ---------- Messages ----------

export async function markMessageAction(fd: FormData) {
  const u = await requireUser(["host", "admin"]);
  const id = str(fd, "id", 40), handled = str(fd, "handled") === "1";
  if (u.role === "admin") await q("UPDATE messages SET handled = $2 WHERE id = $1", [id, handled]);
  else await q("UPDATE messages m SET handled = $3 FROM properties p WHERE m.id = $1 AND m.property_id = p.id AND p.host_id = $2", [id, u.id, handled]);
  revalidatePath("/host/messages");
  revalidatePath("/admin/messages");
}

/** Host or admin records money received by Zelle, Venmo or cash. Confirms the booking once the amount due now is in. */
export async function markPaidAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { u, b } = await manageableBooking(str(fd, "id", 40));
  if (!b) return { error: "You can't manage this booking." };
  const amount = toCents(str(fd, "amount"));
  if (!amount || amount <= 0) return { error: "Enter the amount you received." };
  if (!["awaiting_payment", "confirmed"].includes(b.status)) return { error: "This booking isn't active." };
  const method = str(fd, "method") || b.payment_method || "zelle";
  if (!["zelle", "venmo", "cash", "card", "ach"].includes(method)) return { error: "Choose how the money was paid." };
  const r = await recordPayment(b.id, amount, { method, recordedBy: u.id, note: str(fd, "note", 200) });
  if (!r.ok) return { error: r.reason === "taken" ? "The payment was recorded, but these dates were already taken by someone else. Please refund the guest." : "Booking not found." };
  const back = safeNext(str(fd, "back", 300), "/host/bookings");
  redirect(withMsg(back, "paid"));
}

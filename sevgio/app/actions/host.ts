"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { one, q, tx } from "@/lib/db.ts";
import { requireUser, safeNext } from "@/lib/auth.ts";
import { withMsg } from "@/components/Flash.tsx";
import { requireManageable } from "@/lib/access.ts";
import { addBlock, setBookingStatus, type Booking } from "@/lib/bookings.ts";
import { AMENITIES, CANCELLATION, PROPERTY_TYPES } from "@/lib/constants.ts";
import { int, lines, slugify, str, type ActionState } from "@/lib/validate.ts";
import { toCents } from "@/lib/money.ts";
import { processPhoto } from "@/lib/photos.ts";
import { syncFeed } from "@/lib/calendar-sync.ts";
import { sendEmail, siteUrl } from "@/lib/email.ts";
import { logEvent } from "@/lib/log.ts";
import { fmtDate, todayLocal } from "@/lib/dates.ts";

// ---------- Listings ----------

function readListing(fd: FormData) {
  const v = {
    title: str(fd, "title", 120), property_type: str(fd, "property_type", 30), city: str(fd, "city", 80), area: str(fd, "area", 80), address: str(fd, "address", 300),
    description: str(fd, "description", 8000), max_guests: int(fd, "max_guests"), bedrooms: int(fd, "bedrooms"), beds: int(fd, "beds"), bathrooms: Number(str(fd, "bathrooms")),
    nightly: toCents(str(fd, "nightly_price")), cleaning: toCents(str(fd, "cleaning_fee") || "0"), min_nights: int(fd, "min_nights"), max_nights: int(fd, "max_nights"),
    booking_mode: str(fd, "booking_mode"), cancellation_policy: str(fd, "cancellation_policy"), check_in_time: str(fd, "check_in_time", 30), check_out_time: str(fd, "check_out_time", 30),
    amenities: fd.getAll("amenities").map(String).filter(a => a in AMENITIES), house_rules: lines(str(fd, "house_rules", 5000)), arrival_instructions: str(fd, "arrival_instructions", 5000),
    status: str(fd, "status"),
  };
  let error = "";
  if (!v.title) error = "Give the listing a title.";
  else if (!v.city) error = "Add the town or city.";
  else if (!(v.property_type in PROPERTY_TYPES)) error = "Choose a property type.";
  else if (!(v.max_guests >= 1 && v.max_guests <= 50)) error = "Maximum guests must be between 1 and 50.";
  else if (!(v.bedrooms >= 0 && v.beds >= 0)) error = "Bedrooms and beds can't be negative.";
  else if (!(v.bathrooms >= 0 && v.bathrooms <= 20 && Number.isInteger(v.bathrooms * 2))) error = "Bathrooms should be a whole or half number, like 1 or 1.5.";
  else if (!v.nightly || v.nightly < 1000) error = "Nightly price must be at least $10.";
  else if (v.cleaning === null) error = "Cleaning fee must be a number (use 0 for none).";
  else if (!(v.min_nights >= 1 && v.min_nights <= 60)) error = "Minimum nights must be between 1 and 60.";
  else if (!(v.max_nights >= v.min_nights && v.max_nights <= 365)) error = "Maximum nights must be at least the minimum, and at most 365.";
  else if (!["instant", "request"].includes(v.booking_mode)) error = "Choose how guests book.";
  else if (!(v.cancellation_policy in CANCELLATION)) error = "Choose a cancellation policy.";
  else if (!["draft", "published", "hidden"].includes(v.status)) error = "Choose whether the listing is visible.";
  else if (v.status === "published" && v.description.length < 40) error = "Add a description of at least a couple of sentences before publishing.";
  return { v, error };
}

export async function createListingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser(["host", "admin"]);
  const { v, error } = readListing(fd);
  if (error) return { error };
  // Admins can create a listing on behalf of a host.
  let hostId = u.id;
  if (u.role === "admin" && str(fd, "host_id")) {
    const h = await one<{ id: string }>("SELECT id FROM users WHERE id = $1 AND role IN ('host','admin')", [str(fd, "host_id")]);
    if (!h) return { error: "Choose a host for this listing." };
    hostId = h.id;
  }
  let slug = slugify(`${v.title} ${v.city}`);
  if (await one("SELECT 1 FROM properties WHERE slug = $1", [slug])) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const row = await one<{ id: string }>(
    `INSERT INTO properties (slug, host_id, title, property_type, city, area, address, description, max_guests, bedrooms, beds, bathrooms, nightly_price_cents, cleaning_fee_cents,
       min_nights, max_nights, booking_mode, cancellation_policy, check_in_time, check_out_time, amenities, house_rules, arrival_instructions, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'draft') RETURNING id`,
    [slug, hostId, v.title, v.property_type, v.city, v.area, v.address, v.description, v.max_guests, v.bedrooms, v.beds, v.bathrooms, v.nightly, v.cleaning,
      v.min_nights, v.max_nights, v.booking_mode, v.cancellation_policy, v.check_in_time || "3:00 pm", v.check_out_time || "11:00 am", v.amenities, v.house_rules, v.arrival_instructions],
  );
  await logEvent("info", "Listings", `Listing created: ${v.title}`, {}, u.id);
  redirect(`/host/listings/${row!.id}/photos?created=1`);
}

export async function updateListingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { u, p } = await requireManageable(str(fd, "id", 40));
  const { v, error } = readListing(fd);
  if (error) return { error };
  if (v.status === "published") {
    const photos = await one<{ n: number }>("SELECT count(*) AS n FROM photos WHERE property_id = $1", [p.id]);
    if (!photos || photos.n === 0) return { error: "Add at least one photo before publishing." };
  }
  await q(
    `UPDATE properties SET title=$2, property_type=$3, city=$4, area=$5, address=$6, description=$7, max_guests=$8, bedrooms=$9, beds=$10, bathrooms=$11, nightly_price_cents=$12,
       cleaning_fee_cents=$13, min_nights=$14, max_nights=$15, booking_mode=$16, cancellation_policy=$17, check_in_time=$18, check_out_time=$19, amenities=$20, house_rules=$21,
       arrival_instructions=$22, status=$23, updated_at=now() WHERE id=$1`,
    [p.id, v.title, v.property_type, v.city, v.area, v.address, v.description, v.max_guests, v.bedrooms, v.beds, v.bathrooms, v.nightly, v.cleaning, v.min_nights, v.max_nights,
      v.booking_mode, v.cancellation_policy, v.check_in_time, v.check_out_time, v.amenities, v.house_rules, v.arrival_instructions, v.status],
  );
  if (v.nightly !== p.nightly_price_cents || v.status !== p.status) await logEvent("info", "Listings", `${v.title}: ${v.status !== p.status ? `status ${p.status} → ${v.status}` : ""} ${v.nightly !== p.nightly_price_cents ? `price ${p.nightly_price_cents / 100} → ${v.nightly! / 100}` : ""}`.trim(), { property: p.id }, u.id);
  revalidatePath(`/stays/${p.slug}`);
  return { ok: v.status === "published" ? "Saved. Changes are live on the site." : "Saved. This listing is not visible to guests." };
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
    const r = await setBookingStatus(b.id, ["pending"], "confirmed", { hostNote: note || undefined });
    if (!r) return { error: "This request was already answered or has expired." };
    await sendEmail(b.guest_email, `Confirmed: ${b.title}`, `Good news! Your request to stay at ${b.title} for ${dates} was accepted.\n${note ? "\nNote from the host: " + note + "\n" : ""}\nReference: ${b.code}\nSee your booking and arrival details: ${siteUrl()}/trips/${b.code}`);
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
    const r = await setBookingStatus(b.id, ["pending", "confirmed"], "cancelled", { cancelledBy: u.role === "admin" ? "admin" : "host", hostNote: note });
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

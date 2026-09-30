"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { one } from "@/lib/db.ts";
import { requireUser } from "@/lib/auth.ts";
import { createBooking, setBookingStatus, type Booking } from "@/lib/bookings.ts";
import { getSettings } from "@/lib/settings.ts";
import { str, type ActionState } from "@/lib/validate.ts";
import { partyFromForm, partyLabel } from "@/lib/party.ts";
import { sendEmail, siteUrl } from "@/lib/email.ts";
import { logEvent } from "@/lib/log.ts";
import { fmtDate } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";

export async function createBookingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = str(fd, "slug", 100);
  const ci = str(fd, "ci", 10), co = str(fd, "co", 10), party = partyFromForm(fd);
  const u = await requireUser(undefined, `/book/${slug}?ci=${ci}&co=${co}&adults=${party.adults}&children=${party.children}&infants=${party.free_children}`);
  if (!u.verified) return { error: "Please confirm your email address first. Enter the code we sent you above." };
  const name = str(fd, "name", 120), phone = str(fd, "phone", 40), arrival = str(fd, "arrival", 60), message = str(fd, "message", 2000);
  const p = await one<{ id: string; booking_mode: string }>("SELECT id, booking_mode FROM properties WHERE slug = $1", [slug]);
  if (!p) return { error: "This home no longer exists." };
  if (!name) return { error: "Add the name of the lead guest." };
  if (phone.replace(/\D/g, "").length < 7) return { error: "Add a phone number the host can reach you on during your stay." };
  if (p.booking_mode === "request" && message.length < 10) return { error: "Write a short message to the host. It helps them accept your request." };
  if (fd.get("agree") !== "on") return { error: "Tick the box to agree to the house rules and cancellation policy." };

  const settings = await getSettings();
  let result;
  try {
    result = await createBooking({ propertyId: p.id, guestId: u.id, ci, co, party, name, phone, arrival, message, taxPercent: settings.tax_percent });
  } catch (e) {
    await logEvent("error", "Booking", "Booking failed with an unexpected error", { slug, ci, co, error: String(e) }, u.id);
    return { error: "Something went wrong and your booking wasn't saved. Please try again, or contact us." };
  }
  if (!result.ok) {
    if (result.reason === "unavailable") await logEvent("info", "Double booking prevented", "Booking refused because the dates were taken", { slug, ci, co }, u.id);
    return { error: result.error };
  }
  const { booking: b, property } = result;
  if (phone !== u.phone && !u.phone) await one("UPDATE users SET phone = $2 WHERE id = $1", [u.id, phone]);
  await notifyNewBooking(b, property.title, property.host_id, u.email);
  revalidatePath(`/stays/${slug}`);
  redirect(`/trips/${b.code}?new=1`);
}

async function notifyNewBooking(b: Booking, title: string, hostId: string, guestEmail: string) {
  const host = await one<{ email: string; name: string }>("SELECT email, name FROM users WHERE id = $1", [hostId]);
  const dates = `${fmtDate(b.check_in)} – ${fmtDate(b.check_out)}`;
  const link = `${siteUrl()}/trips/${b.code}`;
  if (b.status === "confirmed") {
    await sendEmail(guestEmail, `Booking confirmed: ${title}`, `Hi ${b.guest_name.split(" ")[0]},\n\nYour stay at ${title} is confirmed.\n\nReference: ${b.code}\nDates: ${dates}\nGuests: ${partyLabel(b)}\nTotal: ${money(b.total_cents)}\n\nView your booking: ${link}`);
    if (host) await sendEmail(host.email, `New booking: ${title}, ${dates}`, `${b.guest_name} booked ${title} for ${dates} (${partyLabel(b)}).\nPhone: ${b.guest_phone}\n${b.message ? "\nMessage: " + b.message + "\n" : ""}\nDetails: ${siteUrl()}/host/bookings`);
  } else {
    await sendEmail(guestEmail, `Request sent: ${title}`, `Hi ${b.guest_name.split(" ")[0]},\n\nWe've sent your request to the host. Your dates are held while they decide, usually within a few hours. You'll get another email when they reply.\n\nReference: ${b.code}\nDates: ${dates}\n\nView your request: ${link}`);
    if (host) await sendEmail(host.email, `Booking request: ${title}, ${dates}`, `${b.guest_name} would like to stay at ${title} for ${dates} (${partyLabel(b)}).\n\nMessage: ${b.message}\n\nAccept or decline within 48 hours: ${siteUrl()}/host/bookings`);
  }
}

export async function guestCancelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser();
  const id = str(fd, "id", 40);
  const b = await one<Booking & { title: string; host_email: string }>(
    "SELECT b.*, p.title, h.email AS host_email FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users h ON h.id = p.host_id WHERE b.id = $1 AND b.guest_id = $2",
    [id, u.id],
  );
  if (!b) return { error: "We couldn't find that booking on your account." };
  const updated = await setBookingStatus(b.id, ["pending", "confirmed"], "cancelled", { cancelledBy: "guest" });
  if (!updated) return { error: "This booking can't be cancelled anymore." };
  await sendEmail(b.host_email, `Cancelled: ${b.title}, ${fmtDate(b.check_in)}`, `${b.guest_name} cancelled booking ${b.code} (${fmtDate(b.check_in)} – ${fmtDate(b.check_out)}). The dates are open again.`);
  await sendEmail(u.email, `You cancelled booking ${b.code}`, `Your booking at ${b.title} for ${fmtDate(b.check_in)} – ${fmtDate(b.check_out)} is cancelled.`);
  redirect(`/trips/${b.code}?msg=guestcancelled`);
}

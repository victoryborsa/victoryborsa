"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { one } from "@/lib/db.ts";
import { requireUser } from "@/lib/auth.ts";
import { createBooking, setBookingStatus, type Booking, type PaymentChoice } from "@/lib/bookings.ts";
import { enabledMethods, forListing, isOnline } from "@/lib/payments.ts";
import type { PayMethod } from "@/lib/payment-rules.ts";
import { bookingInfo, notifyBooking, startCheckout } from "@/lib/payment-flow.ts";
import { getSettings } from "@/lib/settings.ts";
import { str, type ActionState } from "@/lib/validate.ts";
import { partyFromForm, partyLabel } from "@/lib/party.ts";
import { sendEmail, siteUrl } from "@/lib/email.ts";
import { verificationRequired } from "@/lib/email.ts";
import { logEvent } from "@/lib/log.ts";
import { fmtDate } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";

export async function createBookingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = str(fd, "slug", 100);
  const ci = str(fd, "ci", 10), co = str(fd, "co", 10), party = partyFromForm(fd);
  const u = await requireUser(undefined, `/book/${slug}?ci=${ci}&co=${co}&adults=${party.adults}&children=${party.children}&infants=${party.free_children}${party.pets ? `&pets=${party.pets}` : ""}${party.services?.length ? `&svc=${party.services.join(",")}` : ""}`);
  if (!u.verified && verificationRequired()) return { error: "Please confirm your email address first. Enter the code we sent you above." };
  const name = str(fd, "name", 120), phone = str(fd, "phone", 40), arrival = str(fd, "arrival", 60), message = str(fd, "message", 2000);
  const p = await one<{ id: string; booking_mode: string; owner_zelle: string; owner_venmo: string }>("SELECT id, booking_mode, owner_zelle, owner_venmo FROM properties WHERE slug = $1", [slug]);
  if (!p) return { error: "This home no longer exists." };
  if (!name) return { error: "Add the name of the lead guest." };
  if (phone.replace(/\D/g, "").length < 7) return { error: "Add a phone number the host can reach you on during your stay." };
  if (p.booking_mode === "request" && message.length < 10) return { error: "Write a short message to the host. It helps them accept your request." };
  if (fd.get("agree") !== "on") return { error: "Tick the box to agree to the house rules and cancellation policy." };

  const settings = forListing(await getSettings(), p);
  const methods = enabledMethods(settings);
  let pay: PaymentChoice | null = null;
  if (methods.length) {
    const method = str(fd, "payment_method") as PayMethod;
    if (!methods.includes(method)) return { error: "Choose how you'd like to pay." };
    pay = { method, card_fee_percent: settings.card_fee_percent, card_fee_fixed_cents: settings.card_fee_fixed_cents, deposit_percent: settings.deposit_percent,
      holdMinutes: isOnline(method) ? 45 : settings.manual_payment_hours * 60 };
  }
  let result;
  try {
    result = await createBooking({ propertyId: p.id, guestId: u.id, ci, co, party, name, phone, arrival, message, taxPercent: settings.tax_percent, pay });
  } catch (e) {
    await logEvent("error", "Booking", "Booking failed with an unexpected error", { slug, ci, co, error: String(e) }, u.id);
    return { error: "Something went wrong and your booking wasn't saved. Please try again, or contact us." };
  }
  if (!result.ok) {
    if (result.reason === "unavailable") await logEvent("info", "Double booking prevented", "Booking refused because the dates were taken", { slug, ci, co }, u.id);
    return { error: result.error };
  }
  const { booking: b } = result;
  if (phone !== u.phone && !u.phone) await one("UPDATE users SET phone = $2 WHERE id = $1", [u.id, phone]);
  const info = (await bookingInfo(b.id))!;
  revalidatePath(`/stays/${slug}`);
  // Card / bank transfer: straight to Stripe's secure page. Emails go out once it's paid.
  if (b.status === "awaiting_payment" && isOnline(b.payment_method)) {
    let url: string;
    try {
      url = await startCheckout(info);
    } catch (e) {
      await logEvent("error", "Payment", `Could not start Stripe checkout for ${b.code}`, { error: String(e) }, u.id);
      redirect(`/trips/${b.code}?new=1&payerror=1`);
    }
    redirect(url);
  }
  await notifyBooking(info);
  redirect(`/trips/${b.code}?new=1`);
}

export async function payNowAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser();
  const b = await bookingInfo(str(fd, "id", 40));
  if (!b || b.guest_id !== u.id) return { error: "We couldn't find that booking on your account." };
  if (b.status !== "awaiting_payment" || !isOnline(b.payment_method)) return { error: "This booking doesn't need an online payment." };
  if (b.payment_deadline && new Date(b.payment_deadline) < new Date()) return { error: "The time to pay has passed and the dates were released. Please book again." };
  let url: string;
  try {
    url = await startCheckout(b);
  } catch (e) {
    await logEvent("error", "Payment", `Could not start Stripe checkout for ${b.code}`, { error: String(e) }, u.id);
    return { error: "We couldn't open the payment page. Please try again in a minute, or contact us." };
  }
  redirect(url);
}

export async function guestCancelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser();
  const id = str(fd, "id", 40);
  const b = await one<Booking & { title: string; host_email: string }>(
    "SELECT b.*, p.title, h.email AS host_email FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users h ON h.id = p.host_id WHERE b.id = $1 AND b.guest_id = $2",
    [id, u.id],
  );
  if (!b) return { error: "We couldn't find that booking on your account." };
  const updated = await setBookingStatus(b.id, ["pending", "awaiting_payment", "confirmed"], "cancelled", { cancelledBy: "guest" });
  if (!updated) return { error: "This booking can't be cancelled anymore." };
  await sendEmail(b.host_email, `Cancelled: ${b.title}, ${fmtDate(b.check_in)}`, `${b.guest_name} cancelled booking ${b.code} (${fmtDate(b.check_in)} – ${fmtDate(b.check_out)}). The dates are open again.`);
  await sendEmail(u.email, `You cancelled booking ${b.code}`, `Your booking at ${b.title} for ${fmtDate(b.check_in)} – ${fmtDate(b.check_out)} is cancelled.`);
  redirect(`/trips/${b.code}?msg=guestcancelled`);
}

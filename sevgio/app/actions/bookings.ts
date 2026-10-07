"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { checkConflicts } from "@/lib/conflicts.ts";
import { one } from "@/lib/db.ts";
import { requireUser } from "@/lib/auth.ts";
import { changeReservation, createBooking, repriceForNights, setBookingStatus, stayProblem, type Booking, type PaymentChoice } from "@/lib/bookings.ts";
import { enabledMethods, forListing, isOnline, onlineMethods } from "@/lib/payments.ts";
import type { PayMethod } from "@/lib/payment-rules.ts";
import { bookingInfo, canPayBalance, emailReservationUpdate, notifyBooking, startBalanceCheckout, startCheckout } from "@/lib/payment-flow.ts";
import { getSettings } from "@/lib/settings.ts";
import { str, type ActionState } from "@/lib/validate.ts";
import { partyFromForm, partyLabel } from "@/lib/party.ts";
import { sendEmail, siteUrl } from "@/lib/email.ts";
import { verificationRequired } from "@/lib/email.ts";
import { logEvent } from "@/lib/log.ts";
import { fmtDate, isIsoDate, nightsBetween, todayLocal } from "@/lib/dates.ts";
import { FLIGHT_SERVICES } from "@/lib/constants.ts";

const time12 = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
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
  const serviceDetails: Record<string, string> = {};
  for (const key of party.services || []) {
    const f = FLIGHT_SERVICES[key];
    if (!f) continue;
    const date = str(fd, `fl_${key}_date`, 10), time = str(fd, `fl_${key}_time`, 5), flight = str(fd, `fl_${key}_flight`, 60);
    const label = f.label;
    if (!isIsoDate(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: `Add the date and time for your ${label}.` };
    if (flight.length < 2) return { error: `Add your airline and flight number for the ${label}.` };
    serviceDetails[key] = `${f.detail} ${fmtDate(date, { weekday: "short", month: "short", day: "numeric" })}, ${time12(time)} · ${flight}`;
  }
  if (fd.get("agree") !== "on") return { error: "Tick the box to agree to the house rules and cancellation policy." };

  const settings = forListing(await getSettings(), p);
  const methods = enabledMethods(settings);
  let pay: PaymentChoice | null = null;
  const choice = str(fd, "payment_method");
  if (settings.pay_later && (choice === "later" || !methods.length)) {
    // Pay at the property: recorded like a hand-entered reservation (cash, nothing due now), so it's confirmed straight away.
    pay = { method: "cash", card_fee_percent: 0, card_fee_fixed_cents: 0, deposit_percent: 0, holdMinutes: 0, later: true };
  } else if (methods.length) {
    const method = choice as PayMethod;
    if (!methods.includes(method)) return { error: "Choose how you'd like to pay." };
    pay = { method, card_fee_percent: settings.card_fee_percent, card_fee_fixed_cents: settings.card_fee_fixed_cents, deposit_percent: settings.deposit_percent,
      holdMinutes: isOnline(method) ? 45 : settings.manual_payment_hours * 60 };
  }
  let result;
  try {
    result = await createBooking({ propertyId: p.id, guestId: u.id, ci, co, party, name, phone, arrival, message, taxPercent: settings.tax_percent, pay, serviceDetails });
  } catch (e) {
    await logEvent("error", "Booking", "Booking failed with an unexpected error", { slug, ci, co, error: String(e) }, u.id);
    return { error: "Something went wrong and your booking wasn't saved. Please try again, or contact us." };
  }
  if (!result.ok) {
    if (result.reason === "unavailable") await logEvent("info", "Double booking prevented", "Booking refused because the dates were taken", { slug, ci, co }, u.id);
    return { error: result.error };
  }
  const { booking: b } = result;
  after(checkConflicts);
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

/** Guest → booking page → Pay now: pays what's still owed on a confirmed booking by card or bank transfer through Stripe. */
export async function payBalanceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser();
  const b = await bookingInfo(str(fd, "id", 40));
  if (!b || b.guest_id !== u.id) return { error: "We couldn't find that booking on your account." };
  if (!canPayBalance(b)) return { error: "There's nothing left to pay on this booking." };
  const settings = await getSettings();
  const method = str(fd, "method") as "card" | "ach";
  if (!onlineMethods(settings).includes(method)) return { error: "Online payment isn't available right now. You can pay at the property, or contact us." };
  let url: string;
  try {
    url = await startBalanceCheckout(b, method, settings);
  } catch (e) {
    await logEvent("error", "Payment", `Could not start Stripe checkout for ${b.code}`, { error: String(e) }, u.id);
    return { error: "We couldn't open the payment page. Please try again in a minute, or contact us." };
  }
  redirect(url);
}

/** Admin → reservation page → Email payment link: tells the guest they can pay what's owed online. */
export async function sendPaymentLinkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser(["admin"]);
  const b = await bookingInfo(str(fd, "id", 40));
  if (!b) return { error: "Booking not found." };
  if (!canPayBalance(b)) return { error: "This booking has nothing left to pay." };
  if (!onlineMethods(await getSettings()).length) return { error: "Online payment isn't switched on. Add the Stripe keys in Render, then tick Card in Admin → Settings." };
  const due = money(b.total_cents - b.paid_cents);
  const link = `${siteUrl()}/trips/${b.code}`;
  const r = await sendEmail(b.guest_email, `Pay online for your stay ${b.code}: ${b.title}`,
    `Hi ${b.guest_name.split(" ")[0] || "there"},\n\nYou can now pay for your stay at ${b.title} (${fmtDate(b.check_in)} - ${fmtDate(b.check_out)}) online.\n\nAmount due: ${due}\nPay securely here: ${link}\n(Sign in with this email address, then press Pay now.)\n\nIf you'd rather pay at the property, that's fine too.\n\nBooking reference: ${b.code}`);
  await logEvent("info", "Payment", `Payment link for ${b.code} (${due}) emailed to the guest`, { booking: b.code }, admin.id);
  if (!r.ok && !r.queued) return { error: "The email couldn't be sent. Check the email settings, then try again." };
  redirect(`/admin/bookings/${b.code}?msg=paylinksent`);
}

/**
 * Guest → booking page → Change dates. The new nights are checked against every booking and blocked night (the same check as
 * Admin → Edit reservation) and the listing's minimum and maximum stay, then repriced at the booked nightly rate.
 * Once the stay has started only check-out can move. A change that would leave the guest owed money back goes to the host instead.
 */
export async function guestChangeDatesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser();
  const b = await bookingInfo(str(fd, "id", 40));
  if (!b || b.guest_id !== u.id) return { error: "We couldn't find that booking on your account." };
  if (b.status !== "confirmed") return { error: b.status === "pending" || b.status === "awaiting_payment" ? "Your dates can be changed once the booking is confirmed. Until then, contact us." : "This booking can't be changed anymore." };
  const today = todayLocal();
  if (b.check_out <= today) return { error: "This stay has ended, so it can't be changed." };
  const ci = str(fd, "check_in", 10), co = str(fd, "check_out", 10);
  if (!isIsoDate(ci) || !isIsoDate(co) || co <= ci) return { error: "Choose your new check-in and check-out dates." };
  if (ci === b.check_in && co === b.check_out) return { error: "Those are your current dates. Choose new dates to change your stay." };
  const started = b.check_in <= today;
  if (started && ci !== b.check_in) return { error: `Your stay has started, so check-in stays ${fmtDate(b.check_in)}. You can still change your check-out date.` };
  if (started && co <= today) return { error: "Check-out must be after today." };
  const p = await one<{ min_nights: number; max_nights: number; max_guests: number }>("SELECT min_nights, max_nights, max_guests FROM properties WHERE id = $1", [b.property_id]);
  if (p) {
    const problem = stayProblem(p, ci, co, { adults: b.adults, children: b.children, free_children: b.free_children }, started ? b.check_in : today);
    if (problem) return { error: problem };
  }
  const newTotal = repriceForNights(b, nightsBetween(ci, co)).total_cents;
  if (b.paid_cents > newTotal) return { error: `You've already paid ${money(b.paid_cents)}, and the new dates would cost ${money(newTotal)}. To shorten a paid stay, please contact us with your reference ${b.code} so we can arrange the difference.` };
  const r = await changeReservation(b.id, { checkIn: ci, checkOut: co, guestName: b.guest_name, guestPhone: b.guest_phone, guests: b.guests });
  if (!r.ok) return { error: r.error.includes("overlap") ? "Some of those nights are already booked. Please choose other dates." : r.error };
  const a = r.before, n = r.after;
  const changes = [
    `Dates: ${fmtDate(a.check_in)} - ${fmtDate(a.check_out)} → ${fmtDate(n.check_in)} - ${fmtDate(n.check_out)} (${n.nights} night${n.nights === 1 ? "" : "s"})`,
    a.total_cents !== n.total_cents && `Total: ${money(a.total_cents)} → ${money(n.total_cents)}`,
  ].filter((x): x is string => !!x);
  await logEvent("info", "Bookings", `Guest changed ${n.code}: ${changes.join("; ")}`, { booking: n.code, property: n.property_id, platform: "sevgio" }, u.id);
  after(checkConflicts);
  const info = await bookingInfo(n.id);
  if (info) {
    await emailReservationUpdate(info, changes);
    const text = `${n.guest_name} changed their booking ${n.code} at ${info.title}.\n\n${changes.join("\n")}\n\nDetails: ${siteUrl()}/admin/bookings/${n.code}`;
    await sendEmail(info.host_email, `Guest changed dates ${n.code}: ${info.title}`, text);
    const admins = await one<{ emails: string[] }>("SELECT coalesce(array_agg(email), '{}') AS emails FROM users WHERE role = 'admin' AND lower(email) <> lower($1)", [info.host_email]);
    for (const e of admins?.emails || []) await sendEmail(e, `Guest changed dates ${n.code}: ${info.title}`, text);
  }
  revalidatePath(`/trips/${n.code}`);
  redirect(`/trips/${n.code}?msg=datesChanged`);
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
  after(checkConflicts);
  await sendEmail(b.host_email, `Cancelled: ${b.title}, ${fmtDate(b.check_in)}`, `${b.guest_name} cancelled booking ${b.code} (${fmtDate(b.check_in)} - ${fmtDate(b.check_out)}). The dates are open again.`);
  await sendEmail(u.email, `You cancelled booking ${b.code}`, `Your booking at ${b.title} for ${fmtDate(b.check_in)} - ${fmtDate(b.check_out)} is cancelled.`);
  redirect(`/trips/${b.code}?msg=guestcancelled`);
}

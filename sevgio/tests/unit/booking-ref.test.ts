// Run with: DATABASE_URL=postgres://.../sevgio_test npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, q, one } from "../../lib/db.ts";
import { addDays, todayLocal } from "../../lib/dates.ts";
import { createBooking } from "../../lib/bookings.ts";
import { paymentLater, paymentText, reservationStatus } from "../../lib/statuses.ts";
import { compactRef, likeSafe, sortResults, stayPhase, type SearchRow } from "../../lib/booking-ref.ts";
import { searchReservations } from "../../lib/reservation-search.ts";

const T = todayLocal();

test("references compare without dashes, spaces or capitals", () => {
  assert.equal(compactRef("sv-7kq 2md"), "SV7KQ2MD");
  assert.equal(compactRef(" SV-7KQ2MD "), "SV7KQ2MD");
});

test("search terms with % or _ are matched literally", () => {
  assert.equal(likeSafe("50%_off"), "50\\%\\_off");
});

test("stay phase: upcoming, staying now, past, cancelled", () => {
  assert.equal(stayPhase("confirmed", addDays(T, 3), addDays(T, 5), T), "upcoming");
  assert.equal(stayPhase("confirmed", addDays(T, -1), addDays(T, 2), T), "current");
  assert.equal(stayPhase("confirmed", T, addDays(T, 2), T), "current");
  assert.equal(stayPhase("confirmed", addDays(T, -5), addDays(T, -2), T), "past");
  for (const s of ["cancelled", "declined", "expired"]) assert.equal(stayPhase(s, addDays(T, 3), addDays(T, 5), T), "cancelled");
});

test("payment status in words: Unpaid, Partially Paid, Paid, Refunded, Payment unavailable", () => {
  const b = { status: "confirmed", payment_method: "zelle", payment_status: "pending", total_cents: 50000, paid_cents: 0 };
  assert.equal(paymentText(b), "Unpaid · Waiting for payment");
  assert.equal(paymentText({ ...b, payment_status: "paid", paid_cents: 50000 }), "Paid");
  assert.equal(paymentText({ ...b, payment_status: "deposit_paid", paid_cents: 10000 }), "Partially Paid · $400 due");
  assert.equal(paymentText({ ...b, payment_status: "failed" }), "Unpaid · The last payment attempt failed");
  assert.equal(paymentText({ ...b, status: "pending" }), "Unpaid · Nothing is due until the host accepts");
  assert.equal(paymentText({ ...b, payment_method: null, payment_status: "none" }), "Payment unavailable");
  assert.equal(paymentText({ ...b, status: "cancelled" }), "Unpaid · Nothing is owed");
  assert.equal(paymentText({ ...b, status: "cancelled", payment_status: "refunded", paid_cents: 50000 }), "Refunded · $500 returned to the guest");
  assert.equal(paymentLater({ ...b, payment_method: null, payment_status: "none" }), "Host will contact you regarding payment.");
});

test("reservation statuses: one set of names for every source", () => {
  const r = (x: object) => reservationStatus({ status: "confirmed", check_in: addDays(T, 3), check_out: addDays(T, 5), today: T, ...x }).label;
  assert.equal(r({}), "Confirmed");
  assert.equal(r({ status: "pending" }), "Pending");
  assert.equal(r({ status: "awaiting_payment" }), "Pending");
  assert.equal(r({ kind: "unknown" }), "External Calendar Block");
  assert.equal(r({ kind: "blocked" }), "External Calendar Block");
  assert.equal(r({ kind: "reservation" }), "Confirmed");
  assert.equal(r({ needsReview: true }), "Needs Review");
  assert.equal(r({ status: "cancelled", needsReview: true }), "Cancelled");
  assert.equal(r({ status: "declined" }), "Cancelled");
  assert.equal(r({ check_in: addDays(T, -1), check_out: addDays(T, 2) }), "Checked In");
  assert.equal(r({ check_in: addDays(T, -5), check_out: addDays(T, -2) }), "Checked Out");
  // A calendar block never reads as an unconfirmed reservation, even with no name or reference.
  assert.notEqual(r({ kind: "unknown" }), "Unconfirmed");
});

test("results: exact reference first, then staying now, upcoming soonest, past latest, cancelled", () => {
  const r = (ref: string, phase: SearchRow["phase"], check_in: string) => ({ ref, phase, check_in } as SearchRow);
  const out = sortResults([
    r("SV-PAST01", "past", "2026-01-01"), r("SV-PAST02", "past", "2026-03-01"), r("SV-CANC01", "cancelled", "2026-05-01"),
    r("SV-UPCO02", "upcoming", "2026-12-01"), r("SV-UPCO01", "upcoming", "2026-11-01"), r("SV-CURR01", "current", "2026-10-01"), r("SV-EXACT1", "past", "2025-01-01"),
  ], "sv-exact1");
  assert.deepEqual(out.map(x => x.ref), ["SV-EXACT1", "SV-CURR01", "SV-UPCO01", "SV-UPCO02", "SV-PAST02", "SV-PAST01", "SV-CANC01"]);
});

// ---- Search against the database ----
let hostId = "", otherHostId = "", guestId = "", propId = "", otherPropId = "";
before(async () => {
  await q("TRUNCATE bookings, blocks, photos, properties, sessions, users, channel_reservations RESTART IDENTITY CASCADE");
  hostId = (await one<{ id: string }>("INSERT INTO users (email, name, password_hash, role) VALUES ('h@ref.test','Host','x','host') RETURNING id"))!.id;
  otherHostId = (await one<{ id: string }>("INSERT INTO users (email, name, password_hash, role) VALUES ('h2@ref.test','Host Two','x','host') RETURNING id"))!.id;
  guestId = (await one<{ id: string }>("INSERT INTO users (email, name, password_hash) VALUES ('mary.jones@ref.test','Mary','x') RETURNING id"))!.id;
  const prop = (slug: string, title: string, host: string) => one<{ id: string }>(
    `INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, cleaning_fee_cents, min_nights, booking_mode, status)
     VALUES ($1, $2, $3, 'Pittsburgh', 4, 10000, 0, 1, 'instant', 'published') RETURNING id`, [slug, host, title]);
  propId = (await prop("ref-a", "Shadyside Suite", hostId))!.id;
  otherPropId = (await prop("ref-b", "Lawrenceville Loft", otherHostId))!.id;
});
after(async () => { await pool.end(); });

const book = async (property: string, name: string, ci: number, co: number) => {
  const r = await createBooking({ propertyId: property, guestId, ci: addDays(T, ci), co: addDays(T, co), party: { adults: 1, children: 0, free_children: 0 }, name, phone: "555-0100", arrival: "", message: "", taxPercent: 0, pay: null });
  assert.ok(r.ok, !r.ok ? r.error : "");
  return r.booking;
};

test("finds bookings by any part of the name, any capitalization, and by whole or partial reference", async () => {
  const a = await book(propId, "Mary Ann Jones", 10, 12);
  const b = await book(otherPropId, "Mary Smith", 20, 22);
  const c = await book(propId, "Peter O'Neil", 30, 31);
  await q("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [c.id]);

  const names = (rows: { guest_name: string }[]) => rows.map(r => r.guest_name).sort();
  assert.deepEqual(names(await searchReservations("mary", T)), ["Mary Ann Jones", "Mary Smith"]);
  assert.deepEqual(names(await searchReservations("JONES", T)), ["Mary Ann Jones"]);
  assert.deepEqual(names(await searchReservations("mary jones", T)), ["Mary Ann Jones"]);
  assert.deepEqual(names(await searchReservations("o'neil", T)), ["Peter O'Neil"]);
  assert.deepEqual(names(await searchReservations("%", T)), []);

  const exact = await searchReservations(b.code.toLowerCase(), T);
  assert.equal(exact[0].ref, b.code);
  assert.equal(exact[0].title, "Lawrenceville Loft");
  const noDash = await searchReservations(a.code.replace("-", " "), T);
  assert.equal(noDash[0].ref, a.code);
  const tail = await searchReservations(a.code.slice(-4), T);
  assert.ok(tail.some(r => r.ref === a.code));

  const cancelled = (await searchReservations("peter", T))[0];
  assert.equal(cancelled.phase, "cancelled");
  assert.equal(cancelled.status_label, "Cancelled");
  assert.deepEqual(names(await searchReservations("", T, { phase: "cancelled" })), ["Peter O'Neil"]);
  assert.deepEqual(names(await searchReservations("mary", T, { hostId })), ["Mary Ann Jones"]);
});

test("includes reservations from other sites, but not blocked dates", async () => {
  await q(`INSERT INTO channel_reservations (property_id, channel, kind, source, external_ref, check_in, check_out, guest_name)
           VALUES ($1, 'airbnb', 'reservation', 'manual', 'HMQWERTY12', $2, $3, 'Mary Airbnb'), ($1, 'airbnb', 'blocked', 'manual', '', $4, $5, 'Mary Blocked')`,
    [propId, addDays(T, 40), addDays(T, 42), addDays(T, 50), addDays(T, 52)]);
  const rows = await searchReservations("mary airbnb", T);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "channel");
  assert.equal(rows[0].site, "Airbnb");
  assert.equal((await searchReservations("hmqwerty", T))[0].ref, "HMQWERTY12");
  assert.equal((await searchReservations("mary blocked", T)).length, 0);
});

test("a booking's reference can't be changed, even when the booking is modified or cancelled", async () => {
  const b = await book(propId, "Lock Test", 60, 62);
  await q("UPDATE bookings SET status = 'cancelled', check_out = $2 WHERE id = $1", [b.id, addDays(T, 63)]);
  assert.equal((await one<{ code: string }>("SELECT code FROM bookings WHERE id = $1", [b.id]))!.code, b.code);
  await assert.rejects(q("UPDATE bookings SET code = 'SV-CHANGED' WHERE id = $1", [b.id]), /cannot be changed/);
});

test("an email address finds that guest's bookings", async () => {
  const rows = await searchReservations("MARY.JONES@ref.test", T);
  assert.ok(rows.length >= 3 && rows.every(r => r.guest_email === "mary.jones@ref.test"));
});

test("stay timing uses the listing's local check-in and check-out times", async () => {
  const { clockMinutes, localNow } = await import("../../lib/booking-ref.ts");
  assert.equal(clockMinutes("3:00 pm", 0), 900);
  assert.equal(clockMinutes("11 AM", 0), 660);
  assert.equal(clockMinutes("12:30 am", 0), 30);
  assert.equal(clockMinutes("15:45", 0), 945);
  assert.equal(clockMinutes("noon-ish", 600), 600);
  const T = "2026-10-06", times = { checkInTime: "4:00 pm", checkOutTime: "10:00 am" };
  // Arrival day: upcoming until 4 pm, then staying.
  assert.equal(stayPhase("confirmed", T, "2026-10-09", T, { minutes: 15 * 60 + 59, ...times }), "upcoming");
  assert.equal(stayPhase("confirmed", T, "2026-10-09", T, { minutes: 16 * 60, ...times }), "current");
  // Departure day: staying until 10 am, then past.
  assert.equal(stayPhase("confirmed", "2026-10-03", T, T, { minutes: 9 * 60 + 59, ...times }), "current");
  assert.equal(stayPhase("confirmed", "2026-10-03", T, T, { minutes: 10 * 60, ...times }), "past");
  // Pittsburgh time, not the server's: 02:30 UTC on Oct 6 is still the evening of Oct 5 there.
  assert.deepEqual(localNow("America/New_York", new Date("2026-10-06T02:30:00Z")), { date: "2026-10-05", minutes: 22 * 60 + 30 });
});

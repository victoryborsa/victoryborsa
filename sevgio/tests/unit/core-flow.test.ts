// The core workflow, end to end against the database: reservation → calendar blocking → calendar sync → double-booking
// protection → editing → cancellation. Run with: DATABASE_URL=postgres://.../sevgio_test npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, q, one } from "../../lib/db.ts";
import { changeReservation, createBooking, createManualBooking, isRangeFree, repriceForNights, setBookingStatus } from "../../lib/bookings.ts";
import { applyFeedEvents, syncManualBlock } from "../../lib/channel-res.ts";
import { addDays, todayLocal } from "../../lib/dates.ts";
import { reservationStatus } from "../../lib/statuses.ts";
import { scrub, scrubText } from "../../lib/log.ts";
import { nextStages } from "../../lib/stages.ts";
import type { IcsEvent } from "../../lib/ical.ts";

const T = todayLocal();
let hostId = "", guestId = "", propId = "", feedId = "";
const ev = (start: string, end: string, uid: string, summary = "Reserved", description = ""): IcsEvent => ({ start, end, uid, summary, description, cancelled: false });

before(async () => {
  await q("TRUNCATE bookings, blocks, photos, properties, sessions, users, channel_reservations, ical_feeds, event_log RESTART IDENTITY CASCADE");
  hostId = (await one<{ id: string }>("INSERT INTO users (email, name, password_hash, role) VALUES ('cf-h@t.test','Host','x','host') RETURNING id"))!.id;
  guestId = (await one<{ id: string }>("INSERT INTO users (email, name, password_hash) VALUES ('cf-g@t.test','Guest','x') RETURNING id"))!.id;
  propId = (await one<{ id: string }>(
    `INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, cleaning_fee_cents, min_nights, booking_mode, status)
     VALUES ('cf', $1, 'Core Flow Home', 'Pittsburgh', 4, 10000, 5000, 1, 'instant', 'published') RETURNING id`, [hostId]))!.id;
  feedId = (await one<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Airbnb', 'https://example.com/a.ics') RETURNING id", [propId]))!.id;
});
after(async () => { await pool.end(); });

const feed = () => ({ id: feedId, property_id: propId });
const web = (ci: string, co: string) => createBooking({ propertyId: propId, guestId, ci, co, party: { adults: 2, children: 0, free_children: 0 }, name: "Web Guest", phone: "", arrival: "", message: "", taxPercent: 7, pay: null });

test("a manual reservation is confirmed with $0 paid, pays at the property, and blocks its dates", async () => {
  const r = await createManualBooking({ propertyId: propId, guestId, ci: addDays(T, 5), co: addDays(T, 8), name: "Phone Guest", phone: "412-555-0100", taxPercent: 7 });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.booking.status, "confirmed");
  assert.equal(r.booking.paid_cents, 0);
  assert.equal(r.booking.payment_method, "cash");
  assert.equal(r.booking.due_now_cents, 0);
  assert.equal(await isRangeFree(propId, addDays(T, 6), addDays(T, 7)), false);
  // The same nights can't be booked on the website or entered by hand again.
  assert.equal((await web(addDays(T, 7), addDays(T, 9))).ok, false);
  assert.equal((await createManualBooking({ propertyId: propId, guestId, ci: addDays(T, 4), co: addDays(T, 6), name: "Other", phone: "", taxPercent: 7 })).ok, false);
});

test("calendar link events block nights; a website booking on them is refused", async () => {
  const r = await applyFeedEvents(feed(), "airbnb", [ev(addDays(T, 20), addDays(T, 23), "uid-1"), ev(addDays(T, 30), addDays(T, 32), "uid-2", "Airbnb (Not available)")], T);
  assert.equal(r.added, 2);
  assert.equal((await web(addDays(T, 21), addDays(T, 22))).ok, false);
  assert.equal((await web(addDays(T, 31), addDays(T, 33))).ok, false);
  assert.equal((await web(addDays(T, 23), addDays(T, 25))).ok, true, "check-out day of the Airbnb stay is free for a new check-in");
});

test("the same calendar event synced twice never creates a duplicate", async () => {
  const again = await applyFeedEvents(feed(), "airbnb", [ev(addDays(T, 20), addDays(T, 23), "uid-1"), ev(addDays(T, 30), addDays(T, 32), "uid-2", "Airbnb (Not available)")], T);
  assert.equal(again.added, 0);
  const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM channel_reservations WHERE feed_id = $1", [feedId]);
  assert.equal(n!.n, 2);
});

test("a stay typed in by hand is linked when the calendar link brings it, not duplicated", async () => {
  const typed = await one<{ id: string; property_id: string; check_in: string; check_out: string; status: string; summary: string }>(
    `INSERT INTO channel_reservations (property_id, channel, kind, source, external_ref, guest_name, guest_name_source, check_in, check_out, summary)
     VALUES ($1, 'airbnb', 'reservation', 'manual', 'HMTYPED1', 'Typed Guest', 'manual', $2, $3, 'Typed') RETURNING id, property_id, check_in::text, check_out::text, status, summary`,
    [propId, addDays(T, 40), addDays(T, 43)]);
  await syncManualBlock(typed!, T);
  await applyFeedEvents(feed(), "airbnb", [ev(addDays(T, 20), addDays(T, 23), "uid-1"), ev(addDays(T, 30), addDays(T, 32), "uid-2", "Airbnb (Not available)"), ev(addDays(T, 40), addDays(T, 43), "uid-3")], T);
  const rows = await q<{ guest_name: string; external_ref: string; feed_id: string | null }>(
    "SELECT guest_name, external_ref, feed_id FROM channel_reservations WHERE property_id = $1 AND check_in = $2", [propId, addDays(T, 40)]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].guest_name, "Typed Guest", "the typed name is kept");
  assert.equal(rows[0].external_ref, "HMTYPED1");
  assert.equal(rows[0].feed_id, feedId);
});

test("statuses: a calendar-only event is an External Calendar Block, never Unconfirmed", async () => {
  const rows = await q<{ check_in: string; check_out: string; status: string; eff_kind: string; guest_name: string }>(
    "SELECT check_in::text, check_out::text, status, eff_kind, guest_name FROM channel_stays WHERE feed_id = $1 ORDER BY check_in", [feedId]);
  const labels = rows.map(r => reservationStatus({ status: r.status, check_in: r.check_in, check_out: r.check_out, today: T, kind: r.eff_kind }).label);
  assert.ok(labels.includes("External Calendar Block"), labels.join(", "));
  assert.ok(!labels.includes("Unconfirmed"));
  assert.ok(rows.every(r => r.guest_name === "" || r.guest_name === "Typed Guest"), "no guest names are invented");
});

test("editing a reservation: new dates are checked against every source, and the price follows the nights", async () => {
  const b = await one<{ id: string; total_cents: number; nightly_price_cents: number }>("SELECT id, total_cents, nightly_price_cents FROM bookings WHERE guest_name = 'Phone Guest'");
  // Onto the Airbnb stay: refused.
  const clash = await changeReservation(b!.id, { checkIn: addDays(T, 19), checkOut: addDays(T, 21), guestName: "Phone Guest", guestPhone: "", guests: 1 });
  assert.equal(clash.ok, false);
  // Onto the website booking made above: refused.
  const clash2 = await changeReservation(b!.id, { checkIn: addDays(T, 22), checkOut: addDays(T, 24), guestName: "Phone Guest", guestPhone: "", guests: 1 });
  assert.equal(clash2.ok, false);
  // Extending by one night into free dates: allowed, one more night is charged at the same rate.
  const ok = await changeReservation(b!.id, { checkIn: addDays(T, 5), checkOut: addDays(T, 9), guestName: "Phone Guest Jr", guestPhone: "412-555-0199", guests: 2 });
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.equal(ok.after.nights, 4);
  assert.equal(ok.after.guest_name, "Phone Guest Jr");
  assert.equal(ok.after.total_cents - ok.before.total_cents, Math.round(b!.nightly_price_cents * 1.07));
  assert.equal(await isRangeFree(propId, addDays(T, 8), addDays(T, 9)), false);
});

test("repricing keeps the agreed nightly rate and fees", () => {
  const r = repriceForNights({ nights: 3, nightly_price_cents: 10000, lodging_cents: 30000, discount_cents: 0, tax_cents: 2450, total_cents: 37450 }, 5);
  assert.deepEqual(r, { nights: 5, lodging_cents: 50000, discount_cents: 0, tax_cents: 3850, total_cents: 58850 });
});

test("cancelling frees the dates for the next guest", async () => {
  const b = await one<{ id: string }>("SELECT id FROM bookings WHERE guest_name = 'Phone Guest Jr'");
  await setBookingStatus(b!.id, ["confirmed"], "cancelled", { cancelledBy: "admin" });
  assert.equal(await isRangeFree(propId, addDays(T, 5), addDays(T, 9)), true);
  assert.equal((await web(addDays(T, 5), addDays(T, 9))).ok, true);
});

test("a calendar event that disappears is cancelled, not deleted, and its nights open up", async () => {
  await applyFeedEvents(feed(), "airbnb", [ev(addDays(T, 30), addDays(T, 32), "uid-2", "Airbnb (Not available)"), ev(addDays(T, 40), addDays(T, 43), "uid-3")], T);
  const r = await one<{ status: string }>("SELECT status FROM channel_reservations WHERE ical_uid = 'uid-1'");
  assert.equal(r!.status, "cancelled");
  assert.equal(await isRangeFree(propId, addDays(T, 20), addDays(T, 23)), true);
});

test("the Operations log never keeps secrets", () => {
  const d = scrub({ password: "hunter2", stripe: "sk_live_abc123", note: "door code: 4512", nested: { card_number: "4242424242424242" }, route: "GET /admin/log" }) as Record<string, unknown>;
  assert.equal(d.password, "[hidden]");
  assert.equal(d.stripe, "[key hidden]");
  assert.equal(d.note, "door code: [hidden]");
  assert.equal((d.nested as Record<string, unknown>).card_number, "[hidden]");
  assert.equal(d.route, "GET /admin/log");
  assert.equal(scrubText("Card 4242 4242 4242 4242 declined"), "Card [card number hidden] declined");
});

test("errors can only be resolved after the fix is verified", () => {
  assert.deepEqual(nextStages("new"), ["investigating"]);
  assert.deepEqual(nextStages("investigating"), ["fix_deployed"]);
  assert.deepEqual(nextStages("fix_deployed"), ["verified", "investigating"]);
  assert.deepEqual(nextStages("verified"), ["resolved", "investigating"]);
  assert.deepEqual(nextStages("resolved"), ["investigating"]);
});

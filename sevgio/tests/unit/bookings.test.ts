// Run with: DATABASE_URL=postgres://.../sevgio_test npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, q, one } from "../../lib/db.ts";
import { createBooking, addBlock, stayProblem, unavailableNights, replaceFeedBlocks } from "../../lib/bookings.ts";
import { addDays, todayLocal } from "../../lib/dates.ts";
import { quote } from "../../lib/pricing.ts";
import { parseIcs, buildIcs } from "../../lib/ical.ts";

let hostId = "", guestId = "", propId = "";
const T = todayLocal();

before(async () => {
  await q("TRUNCATE bookings, blocks, photos, properties, sessions, users RESTART IDENTITY CASCADE");
  hostId = (await one<{ id: string }>("INSERT INTO users (email, name, password_hash, role) VALUES ('h@t.test','Host','x','host') RETURNING id"))!.id;
  guestId = (await one<{ id: string }>("INSERT INTO users (email, name, password_hash) VALUES ('g@t.test','Guest','x') RETURNING id"))!.id;
  propId = (await one<{ id: string }>(
    `INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, cleaning_fee_cents, min_nights, booking_mode, status)
     VALUES ('t', $1, 'Test Home', 'Erie', 4, 15000, 5000, 2, 'instant', 'published') RETURNING id`, [hostId]))!.id;
});
after(async () => { await pool.end(); });

const base = () => ({ propertyId: propId, guestId, guests: 2, name: "Guest", phone: "555-0100", arrival: "", message: "", taxPercent: 6 });

test("20 simultaneous bookings for the same nights: exactly one succeeds", async () => {
  const ci = addDays(T, 10), co = addDays(T, 13);
  const results = await Promise.all(Array.from({ length: 20 }, () => createBooking({ ...base(), ci, co })));
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.ok(results.filter(r => !r.ok).every(r => !r.ok && r.reason === "unavailable"));
});

test("overlapping but not identical dates are refused; back-to-back stays are allowed", async () => {
  const overlap = await createBooking({ ...base(), ci: addDays(T, 12), co: addDays(T, 15) });
  assert.equal(overlap.ok, false);
  const backToBack = await createBooking({ ...base(), ci: addDays(T, 13), co: addDays(T, 15) });
  assert.equal(backToBack.ok, true);
});

test("the database constraint alone blocks overlaps, even if application checks are skipped", async () => {
  await assert.rejects(
    q(`INSERT INTO bookings (code, property_id, guest_id, check_in, check_out, guests, status, nights, nightly_price_cents, cleaning_fee_cents, tax_cents, total_cents, guest_name, guest_phone)
       VALUES ('SV-RAW', $1, $2, $3, $4, 1, 'confirmed', 1, 1, 0, 0, 1, 'x', 'x')`, [propId, guestId, addDays(T, 11), addDays(T, 12)]),
    (e: { code?: string }) => e.code === "23P01",
  );
});

test("cancelled bookings free the dates", async () => {
  const r = await createBooking({ ...base(), ci: addDays(T, 30), co: addDays(T, 32) });
  assert.ok(r.ok);
  if (r.ok) await q("UPDATE bookings SET status='cancelled' WHERE id=$1", [r.booking.id]);
  const again = await createBooking({ ...base(), ci: addDays(T, 30), co: addDays(T, 32) });
  assert.equal(again.ok, true);
});

test("host blocks prevent bookings, and blocks can't overlap bookings", async () => {
  assert.deepEqual(await addBlock(propId, addDays(T, 40), addDays(T, 43), "Owner stay"), { ok: true });
  const r = await createBooking({ ...base(), ci: addDays(T, 42), co: addDays(T, 44) });
  assert.equal(r.ok, false);
  const clash = await addBlock(propId, addDays(T, 10), addDays(T, 11), "x");
  assert.equal(clash.ok, false);
  const nights = await unavailableNights(propId, addDays(T, 39), addDays(T, 45));
  assert.deepEqual(nights, [addDays(T, 40), addDays(T, 41), addDays(T, 42)]);
});

test("imported calendar blocks replace old ones and skip clashes", async () => {
  const clashes = await replaceFeedBlocks(propId, "ical:test", [{ start: addDays(T, 60), end: addDays(T, 62), note: "Airbnb" }, { start: addDays(T, 10), end: addDays(T, 11), note: "Airbnb" }]);
  assert.equal(clashes.length, 1);
  await replaceFeedBlocks(propId, "ical:test", [{ start: addDays(T, 70), end: addDays(T, 71), note: "Airbnb" }]);
  const rows = await q<{ start_date: string }>("SELECT start_date FROM blocks WHERE source='ical:test'");
  assert.deepEqual(rows.map(r => r.start_date), [addDays(T, 70)]);
});

test("stay rules", () => {
  const p = { min_nights: 2, max_nights: 14, max_guests: 4 };
  assert.match(stayProblem(p, addDays(T, 1), addDays(T, 2), 2)!, /minimum/);
  assert.match(stayProblem(p, addDays(T, -1), addDays(T, 2), 2)!, /past/);
  assert.match(stayProblem(p, addDays(T, 1), addDays(T, 4), 5)!, /up to 4 guests/);
  assert.match(stayProblem(p, addDays(T, 1), addDays(T, 20), 2)!, /up to 14 nights/);
  assert.equal(stayProblem(p, addDays(T, 1), addDays(T, 4), 4), null);
  assert.ok(stayProblem(p, "2026-02-30", "2026-03-02", 2));
});

test("price quote", () => {
  const qd = quote({ nightly_price_cents: 15000, cleaning_fee_cents: 5000 }, "2026-11-01", "2026-11-04", 6);
  assert.deepEqual(qd, { nights: 3, nightly: 15000, base: 45000, cleaning: 5000, tax: 3000, total: 53000 });
});

test("iCal round trip, including Airbnb-style folded lines", () => {
  const ics = buildIcs("Test", [{ uid: "1", start: "2026-11-01", end: "2026-11-04", summary: "Booked" }]);
  assert.deepEqual(parseIcs(ics), [{ start: "2026-11-01", end: "2026-11-04", summary: "Booked" }]);
  const airbnb = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261203\r\nSUMMARY:Reserved\r\nDESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/\r\n reservations/details/ABC\r\nEND:VEVENT\r\nEND:VCALENDAR";
  assert.deepEqual(parseIcs(airbnb), [{ start: "2026-12-01", end: "2026-12-03", summary: "Reserved" }]);
});

test("whole home and its rooms share a calendar; rooms don't block each other", async () => {
  const mk = async (slug: string, parent: string | null) => (await one<{ id: string }>(
    `INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, min_nights, booking_mode, status, parent_id)
     VALUES ($1, $2, $1, 'Erie', 6, 10000, 1, 'instant', 'published', $3) RETURNING id`, [slug, hostId, parent]))!.id;
  const house = await mk("house", null), roomA = await mk("room-a", house), roomB = await mk("room-b", house);
  const b = (propertyId: string, s: number, e: number) => createBooking({ ...base(), propertyId, ci: addDays(T, s), co: addDays(T, e) });

  assert.equal((await b(roomA, 100, 103)).ok, true);
  assert.equal((await b(roomB, 100, 103)).ok, true, "another room is still free");
  assert.equal((await b(house, 102, 104)).ok, false, "whole home blocked by a room booking");
  assert.equal((await b(house, 110, 112)).ok, true);
  assert.equal((await b(roomA, 111, 112)).ok, false, "room blocked by a whole-home booking");
  assert.deepEqual(await unavailableNights(house, addDays(T, 99), addDays(T, 104)), [addDays(T, 100), addDays(T, 101), addDays(T, 102)]);

  // A block on the whole home blocks its rooms.
  assert.deepEqual(await addBlock(house, addDays(T, 120), addDays(T, 121), "Owner"), { ok: true });
  assert.equal((await b(roomB, 120, 121)).ok, false);
  // A room can't be blocked over a whole-home booking.
  assert.equal((await addBlock(roomB, addDays(T, 110), addDays(T, 111), "x")).ok, false);

  // Simultaneous: whole home vs. a room for the same nights, many times over. Exactly one wins.
  const results = await Promise.all([...Array(10)].flatMap(() => [b(house, 130, 132), b(roomA, 130, 132)]));
  assert.equal(results.filter(r => r.ok).length, 1);
});

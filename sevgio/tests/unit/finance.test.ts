// Run with: DATABASE_URL=postgres://.../sevgio_test npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, q, one } from "../../lib/db.ts";
import { addDays, todayLocal } from "../../lib/dates.ts";
import { parseIcs, type IcsEvent } from "../../lib/ical.ts";
import { classifyEvent, channelOf, occupancy, unitsOf } from "../../lib/channels.ts";
import { applyFeedEvents, feedOwnsName } from "../../lib/channel-res.ts";
import { guessMapping, parseCsv, parseDate, parseMoney, toRecords, matchListing } from "../../lib/payout-import.ts";
import { applyPayoutRecords } from "../../lib/payout-apply.ts";
import { financeListings, occupancyFor, readFilters, reportRows, statementCsv, totals, type Filters } from "../../lib/finance.ts";
import type { User } from "../../lib/auth.ts";

const T = todayLocal();
const ev = (start: string, end: string, summary: string, uid: string, description = ""): IcsEvent => ({ start, end, summary, uid, description, cancelled: false });

// ---------- Pure helpers ----------

test("calendar events are told apart by site: reservations, blocked dates, and Booking.com's unclear ones", () => {
  assert.deepEqual(classifyEvent("airbnb", "Reserved", "Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABCD1234\nPhone Number (Last 4 Digits): 1234"),
    { kind: "reservation", ref: "HMABCD1234", guest: "" });
  assert.equal(classifyEvent("airbnb", "Airbnb (Not available)").kind, "blocked");
  assert.deepEqual(classifyEvent("vrbo", "Reserved - Jane Doe"), { kind: "reservation", ref: "", guest: "Jane Doe" });
  // Vrbo labels reservations copied from other calendars, and some of its own, "Blocked", so those wait for the host to check.
  assert.equal(classifyEvent("vrbo", "Blocked").kind, "unknown");
  assert.equal(classifyEvent("vrbo", "Owner stay").kind, "blocked");
  assert.equal(classifyEvent("other", "Not available").kind, "unknown");
  assert.equal(classifyEvent("bookingcom", "CLOSED - Not available").kind, "unknown");
  assert.equal(channelOf("Other calendar", "https://www.vrbo.com/icalendar/abc.ics").key, "vrbo");
});

test("iCal events keep their ID, description and cancelled status", () => {
  const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:abc-123@airbnb.com\r\nDTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261105\r\nSUMMARY:Reserved\r\nDESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMQQ12345\\nPhone: 1234\r\nEND:VEVENT\r\n"
    + "BEGIN:VEVENT\r\nUID:x2\r\nSTATUS:CANCELLED\r\nDTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261203\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
  const [a, b] = parseIcs(ics);
  assert.equal(a.uid, "abc-123@airbnb.com");
  assert.match(a.description, /HMQQ12345\nPhone/);
  assert.equal(a.cancelled, false);
  assert.equal(b.cancelled, true);
});

test("occupancy: a whole-home booking fills each room once; room bookings and blocks aren't double counted", () => {
  const listings = [{ id: "H", parent_id: null }, { id: "R1", parent_id: "H" }, { id: "R2", parent_id: "H" }, { id: "S", parent_id: null }];
  const units = unitsOf(listings);
  assert.deepEqual(units.map(u => u.id), ["R1", "R2", "S"]);
  const o = occupancy(units, [
    { property_id: "H", from: "2026-11-01", to: "2026-11-03", kind: "booked" },   // whole house, 2 nights → 4 room-nights
    { property_id: "R1", from: "2026-11-02", to: "2026-11-04", kind: "booked" },  // overlaps the house on the 2nd: only the 3rd is new
    { property_id: "R2", from: "2026-11-01", to: "2026-11-05", kind: "blocked" }, // blocked, but 1st and 2nd were already booked
    { property_id: "S", from: "2026-11-01", to: "2026-11-02", kind: "unknown" },
  ], "2026-11-01", "2026-11-11");
  assert.equal(o.capacity, 30);
  assert.equal(o.booked, 5);
  assert.equal(o.blocked, 2);
  assert.equal(o.unknown, 1);
  assert.equal(o.percent, Math.round((5 / 28) * 1000) / 10);
});

test("payout files: columns are recognised and lines for one reservation are added up", () => {
  const csv = [
    "Date,Type,Confirmation Code,Start Date,Nights,Guest,Listing,Details,Reference,Currency,Amount,Paid Out,Service Fee,Fast Pay Fee,Cleaning Fee,Gross Earnings,Occupancy Taxes",
    "11/06/2026,Payout,,,,,,Transfer to ***1234,,USD,,1180.50,,,,,",
    '11/05/2026,Reservation,HMAAA11111,11/01/2026,4,Ana Lopez,Shadyside Suite,,,USD,"1,180.50",,36.50,,80.00,"1,217.00",95.00',
    "11/20/2026,Resolution Adjustment,HMAAA11111,11/01/2026,4,Ana Lopez,Shadyside Suite,,,USD,-50.00,,,,,,",
    "11/10/2026,Reservation,HMBBB22222,11/08/2026,2,Bo Chen,Unknown Place,,,USD,300.00,,10.00,,0,310.00,0",
  ].join("\n");
  const rows = parseCsv(csv);
  const m = guessMapping(rows[0]);
  assert.equal(rows[0][m.ref!], "Confirmation Code");
  assert.equal(rows[0][m.payout!], "Amount");
  assert.equal(rows[0][m.received!], "Paid Out");
  assert.equal(rows[0][m.commission!], "Service Fee");
  assert.equal(rows[0][m.gross!], "Gross Earnings");
  const { records, skipped } = toRecords(rows.slice(1), m);
  assert.equal(skipped.length, 1);
  const a = records.find(r => r.ref === "HMAAA11111")!;
  assert.deepEqual({ ci: a.check_in, co: a.check_out, rent: a.rent, cleaning: a.cleaning, commission: a.commission, tax: a.tax, payout: a.payout, refund: a.refund, date: a.payout_date },
    { ci: "2026-11-01", co: "2026-11-05", rent: 113700, cleaning: 8000, commission: 3650, tax: 9500, payout: 118050, refund: 5000, date: "2026-11-05" });
  assert.equal(parseMoney("(12.50)"), -1250);
  assert.equal(parseMoney("1.234,56"), 123456);
  assert.equal(parseDate("4 Oct 2026"), "2026-10-04");
  assert.equal(parseDate("Oct 4, 2026"), "2026-10-04");
  assert.equal(parseDate("25/10/2026"), "2026-10-25");
  assert.equal(parseDate("02/30/2026"), null);
  assert.equal(matchListing("Shadyside Suite", [{ id: "1", title: "Shadyside Suite – Private Room" }, { id: "2", title: "Oakland Loft" }])?.id, "1");
});

// ---------- Database: sync, reports and imports ----------

let admin: User, houseId = "", roomId = "", soloId = "", feedId = "", guestId = "";

before(async () => {
  const tag = Date.now().toString(36);
  const host = (await one<{ id: string }>("INSERT INTO users (email, name, password_hash, role) VALUES ($1, 'Fin Host', 'x', 'admin') RETURNING id", [`fin-${tag}@t.test`]))!.id;
  guestId = (await one<{ id: string }>("INSERT INTO users (email, name, password_hash) VALUES ($1, 'Fin Guest', 'x') RETURNING id", [`fing-${tag}@t.test`]))!.id;
  admin = { id: host, role: "admin", name: "Fin Host", email: "" } as User;
  const prop = async (title: string, parent: string | null, fee = 0) => (await one<{ id: string }>(
    `INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, status, parent_id, management_fee_percent) VALUES ($1, $2, $3, 'Pittsburgh', 4, 10000, 'published', $4, $5) RETURNING id`,
    [`fin-${tag}-${title.toLowerCase().replace(/\W+/g, "-")}`, host, `Fin ${tag} ${title}`, parent, fee]))!.id;
  houseId = await prop("House", null, 20);
  roomId = await prop("Room A", houseId);
  await prop("Room B", houseId);
  soloId = await prop("Solo", null);
  feedId = (await one<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Airbnb', 'https://example.com/a.ics') RETURNING id", [roomId]))!.id;
});
after(async () => { await pool.end(); });

const feedRows = () => q<{ ical_uid: string; check_in: string; check_out: string; status: string; kind: string; external_ref: string; modified_at: string | null }>(
  "SELECT ical_uid, check_in, check_out, status, kind, external_ref, modified_at FROM channel_reservations WHERE feed_id = $1 ORDER BY check_in", [feedId]);

test("refreshing a calendar link updates reservations in place: no duplicates, moved dates, cancellations", async () => {
  const feed = { id: feedId, property_id: roomId };
  const a = ev(addDays(T, 10), addDays(T, 13), "Reserved", "uid-a", "Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMSYNC0001");
  const b = ev(addDays(T, 20), addDays(T, 22), "Reserved", "uid-b");
  const c = ev(addDays(T, 30), addDays(T, 31), "Airbnb (Not available)", "uid-c");
  const past = ev(addDays(T, -10), addDays(T, -7), "Reserved", "uid-past");
  let r = await applyFeedEvents(feed, "airbnb", [a, b, c, past], T);
  assert.equal(r.added, 4);
  r = await applyFeedEvents(feed, "airbnb", [a, b, c, past], T);
  assert.deepEqual([r.added, r.unchanged], [0, 4]);
  assert.equal((await feedRows()).length, 4);
  // b moves a day later; c disappears (cancelled); the past stay drops off the feed (kept).
  r = await applyFeedEvents(feed, "airbnb", [a, { ...b, start: addDays(T, 21), end: addDays(T, 23) }], T);
  assert.deepEqual([r.added, r.changed, r.cancelled], [0, 1, 1]);
  const rows = await feedRows();
  assert.equal(rows.length, 4);
  const byUid = Object.fromEntries(rows.map(x => [x.ical_uid, x]));
  assert.equal(byUid["uid-a"].external_ref, "HMSYNC0001");
  assert.equal(byUid["uid-b"].check_in, addDays(T, 21));
  assert.ok(byUid["uid-b"].modified_at);
  assert.equal(byUid["uid-c"].status, "cancelled");
  assert.equal(byUid["uid-past"].status, "confirmed");
  // Availability follows the active upcoming stays only.
  const blocks = await q<{ start_date: string }>("SELECT start_date FROM blocks WHERE source = $1 ORDER BY start_date", ["ical:" + feedId]);
  assert.deepEqual(blocks.map(x => x.start_date), [addDays(T, 10), addDays(T, 21)]);
  // A reappearing event is reinstated rather than duplicated.
  r = await applyFeedEvents(feed, "airbnb", [a, { ...b, start: addDays(T, 21), end: addDays(T, 23) }, c], T);
  assert.equal(r.added, 0);
  assert.equal((await feedRows()).find(x => x.ical_uid === "uid-c")!.status, "confirmed");
  // A broken, empty calendar doesn't wipe out upcoming stays.
  r = await applyFeedEvents(feed, "airbnb", [], T);
  assert.ok(r.kept);
  assert.equal((await feedRows()).filter(x => x.status === "confirmed").length, 4);
});

test("rows carried over from older syncs (no calendar ID) are adopted, not duplicated", async () => {
  const f2 = (await one<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Vrbo', 'https://example.com/v.ics') RETURNING id", [soloId]))!.id;
  await q("INSERT INTO channel_reservations (property_id, feed_id, channel, check_in, check_out) VALUES ($1, $2, 'vrbo', $3, $4)", [soloId, f2, addDays(T, 40), addDays(T, 44)]);
  const r = await applyFeedEvents({ id: f2, property_id: soloId }, "vrbo", [ev(addDays(T, 40), addDays(T, 44), "Reserved - Sam Lee", "vrbo-1")], T);
  assert.deepEqual([r.added, r.updated], [0, 1]);
  const [row] = await q<{ ical_uid: string; guest_name: string }>("SELECT ical_uid, guest_name FROM channel_reservations WHERE feed_id = $1", [f2]);
  assert.deepEqual(row, { ical_uid: "vrbo-1", guest_name: "Sam Lee" });
});

test("guest names: a name typed in by a host survives calendar refreshes; a name the calendar gave follows the calendar", async () => {
  const f3 = (await one<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Vrbo', 'https://example.com/v3.ics') RETURNING id", [soloId]))!.id;
  const feed = { id: f3, property_id: soloId };
  const typed = ev(addDays(T, 50), addDays(T, 53), "Reserved", "gn-typed");
  const named = ev(addDays(T, 54), addDays(T, 56), "Reserved - Ann Park", "gn-named");
  await applyFeedEvents(feed, "vrbo", [typed, named], T);
  const name = async (uid: string) => (await one<{ guest_name: string; guest_name_source: string }>(
    "SELECT guest_name, guest_name_source FROM channel_reservations WHERE feed_id = $1 AND ical_uid = $2", [f3, uid]))!;
  assert.deepEqual(await name("gn-typed"), { guest_name: "", guest_name_source: "" });
  assert.deepEqual(await name("gn-named"), { guest_name: "Ann Park", guest_name_source: "feed" });
  // A host types names in: one where the calendar gave none, one correcting the calendar's.
  await q("UPDATE channel_reservations SET guest_name = 'Maria Lopez', guest_name_source = 'manual' WHERE feed_id = $1 AND ical_uid = 'gn-typed'", [f3]);
  await q("UPDATE channel_reservations SET guest_name = 'Annabel Park', guest_name_source = 'manual' WHERE feed_id = $1 AND ical_uid = 'gn-named'", [f3]);
  // The next refreshes (even with a different name in the calendar, and moved dates) keep both.
  await applyFeedEvents(feed, "vrbo", [{ ...typed, summary: "Reserved - Someone Else" }, { ...named, end: addDays(T, 57) }], T);
  await applyFeedEvents(feed, "vrbo", [typed, named], T);
  assert.deepEqual(await name("gn-typed"), { guest_name: "Maria Lopez", guest_name_source: "manual" });
  assert.deepEqual(await name("gn-named"), { guest_name: "Annabel Park", guest_name_source: "manual" });
  // A name that came from the calendar is updated when the calendar changes it.
  const f4 = (await one<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Vrbo', 'https://example.com/v4.ics') RETURNING id", [soloId]))!.id;
  await applyFeedEvents({ id: f4, property_id: soloId }, "vrbo", [ev(addDays(T, 70), addDays(T, 72), "Reserved - Jo Smith", "gn-feed")], T);
  await applyFeedEvents({ id: f4, property_id: soloId }, "vrbo", [ev(addDays(T, 70), addDays(T, 72), "Reserved - Joanna Smith", "gn-feed")], T);
  const [fed] = await q<{ guest_name: string }>("SELECT guest_name FROM channel_reservations WHERE feed_id = $1", [f4]);
  assert.equal(fed.guest_name, "Joanna Smith");
  assert.equal(feedOwnsName({ guest_name: "X", guest_name_source: "manual" }), false);
  assert.equal(feedOwnsName({ guest_name: "X", guest_name_source: "import" }), false);
  assert.equal(feedOwnsName({ guest_name: "", guest_name_source: "" }), true);
  await q("DELETE FROM blocks WHERE source IN ($1, $2)", ["ical:" + f3, "ical:" + f4]);
  await q("DELETE FROM channel_reservations WHERE feed_id IN ($1, $2)", [f3, f4]);
});

test("Finance: other-site stays count as bookings, missing money says so, whole home and rooms aren't double counted", async () => {
  const listings = (await financeListings(admin)).filter(l => [houseId, roomId, soloId].includes(l.id) || l.parent_id === houseId);
  // A Sevgio booking of the whole house on the same nights an Airbnb "Not available" block appears on the room: the block is a copy, not counted.
  const ci = addDays(T, 60), co = addDays(T, 63);
  await q(`INSERT INTO bookings (code, property_id, guest_id, check_in, check_out, guests, adults, status, nights, nightly_price_cents, lodging_cents, discount_cents, cleaning_fee_cents, tax_cents, total_cents, guest_name, guest_phone, management_fee_percent)
           VALUES ('SV-FIN1', $1, $2, $3, $4, 2, 2, 'confirmed', 3, 10000, 30000, 0, 5000, 0, 35000, 'Direct Guest', '555', 20)`, [houseId, guestId, ci, co]);
  await q("INSERT INTO channel_reservations (property_id, feed_id, channel, kind, check_in, check_out, ical_uid) VALUES ($1, $2, 'airbnb', 'blocked', $3, $4, 'echo-1')", [roomId, feedId, ci, co]);
  const [echo] = await q<{ eff_kind: string }>("SELECT eff_kind FROM channel_stays WHERE ical_uid = 'echo-1'");
  assert.equal(echo.eff_kind, "mirror");

  const f: Filters = readFilters({ from: addDays(T, 1), to: addDays(T, 90) }, listings);
  const rows = await reportRows(listings, f);
  const airbnb = rows.filter(r => r.channel === "airbnb");
  assert.equal(airbnb.length, 2, "the two upcoming Airbnb reservations on the room (its blocked dates aren't bookings)");
  assert.ok(airbnb.every(r => r.needsEntry && r.rent == null && r.expected == null));
  const direct = rows.find(r => r.ref === "SV-FIN1")!;
  assert.deepEqual([direct.rent, direct.fee, direct.owner, direct.expected], [30000, 6000, 29000, 35000]);
  const t = totals(rows);
  assert.equal(t.rent.cents, 30000);
  assert.equal(t.rent.missing, airbnb.length + 1, "the two Airbnb stays and the Vrbo stay on Solo");
  const csv = statementCsv(rows);
  assert.match(csv, /Needs entry/);
  assert.match(csv, /Total,/);

  // House filter: the house's own booking fills both rooms on its 3 nights; the room's Airbnb nights are added once.
  const house = readFilters({ from: addDays(T, 1), to: addDays(T, 90), property: houseId }, listings);
  const o = await occupancyFor(listings, house);
  const roomNights = airbnb.reduce((n, r) => n + r.nights, 0);
  assert.equal(o.capacity, 90 * 2);
  assert.equal(o.booked, 3 * 2 + roomNights);
  assert.equal(o.bookedNights, 3 + roomNights);
  // Only Airbnb: the Sevgio booking isn't counted as booked.
  const onlyAirbnb = await occupancyFor(listings, { ...house, channel: "airbnb" });
  assert.equal(onlyAirbnb.booked, roomNights);
  assert.equal((await reportRows(listings, { ...f, channel: "sevgio" })).length, 1);
});

test("payout import fills in the money, matches by code or dates, and importing again doesn't double count", async () => {
  const listings = (await financeListings(admin)).filter(l => [houseId, roomId, soloId].includes(l.id) || l.parent_id === houseId);
  const [a] = await q<{ check_in: string; check_out: string }>("SELECT check_in, check_out FROM channel_reservations WHERE ical_uid = 'uid-b'");
  const csv = [
    "Confirmation Code,Start Date,End Date,Listing,Amount,Service Fee,Cleaning Fee,Gross Earnings",
    `HMSYNC0001,${addDays(T, 10)},${addDays(T, 13)},,400.00,15.00,50.00,415.00`,
    `HMNEWCODE9,${a.check_in},${a.check_out},,250.00,10.00,0,260.00`,
    `HMMANUAL77,${addDays(T, 70)},${addDays(T, 72)},Solo,180.00,6.00,0,186.00`,
  ].join("\n");
  const rows = parseCsv(csv);
  const { records } = toRecords(rows.slice(1), guessMapping(rows[0]));
  const opts = { channel: "airbnb", defaultProperty: null, markReceived: false, dryRun: true, today: T };
  const dry = await applyPayoutRecords(listings, records, opts);
  assert.deepEqual([dry.updated, dry.created, dry.skipped], [2, 1, 0]);
  assert.equal((await q("SELECT 1 FROM channel_reservations WHERE external_ref = 'HMMANUAL77'")).length, 0, "dry run saves nothing");
  for (let i = 0; i < 2; i++) await applyPayoutRecords(listings, records, { ...opts, dryRun: false });
  const [x] = await q<{ rent_cents: number; expected_payout_cents: number; commission_cents: number; finance_source: string }>(
    "SELECT rent_cents, expected_payout_cents, commission_cents, finance_source FROM channel_reservations WHERE external_ref = 'HMSYNC0001'");
  assert.deepEqual(x, { rent_cents: 36500, expected_payout_cents: 40000, commission_cents: 1500, finance_source: "import" });
  assert.equal((await q("SELECT 1 FROM channel_reservations WHERE external_ref = 'HMNEWCODE9' AND ical_uid = 'uid-b'")).length, 1, "matched by dates and given its code");
  assert.equal((await q("SELECT 1 FROM channel_reservations WHERE external_ref = 'HMMANUAL77'")).length, 1, "created once, on the Solo listing");
  assert.equal((await q("SELECT 1 FROM blocks WHERE source LIKE 'res:%' AND property_id = $1", [soloId])).length, 1, "new reservation blocks its dates");

  const f = readFilters({ from: addDays(T, 1), to: addDays(T, 90) }, listings);
  const t = totals(await reportRows(listings, f));
  // Rent = gross − cleaning: $300 direct, then $415 − $50, $260 and $186 imported.
  assert.equal(t.rent.cents, 30000 + 36500 + 26000 + 18600);
  assert.equal(t.expected.cents, 35000 + 40000 + 25000 + 18000);
  assert.equal(t.rent.missing, 1, "only the Vrbo stay still has no payout");
});

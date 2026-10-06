// Run with: DATABASE_URL=postgres://.../sevgio_test npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pool, q, one } from "../../lib/db.ts";
import { addDays, todayLocal } from "../../lib/dates.ts";
import type { IcsEvent } from "../../lib/ical.ts";
import { applyFeedEvents } from "../../lib/channel-res.ts";
import { dateOrder, guessMapping, parseCsv, toRecords } from "../../lib/payout-import.ts";
import { applyPayoutRecords } from "../../lib/payout-apply.ts";
import { importChanges, putBackImport, undoImport, undoStep } from "../../lib/import-undo.ts";
import { financeListings } from "../../lib/finance.ts";
import type { User } from "../../lib/auth.ts";

const T = todayLocal();
// Codes unique to this run, since the test database keeps earlier runs' rows.
const K = Date.now().toString(36).slice(-5).toUpperCase();
const code = (n: string) => `HM${K}${n}`;
const ev = (start: string, end: string, summary: string, uid: string, description = ""): IcsEvent => ({ start, end, summary, uid, description, cancelled: false });

let admin: User, houseId = "", roomId = "", soloId = "", airbnbFeed = "", bookingFeed = "";
const props = () => [houseId, roomId, soloId];

before(async () => {
  const tag = Date.now().toString(36);
  const host = (await one<{ id: string }>("INSERT INTO users (email, name, password_hash, role) VALUES ($1, 'Undo Host', 'x', 'admin') RETURNING id", [`undo-${tag}@t.test`]))!.id;
  admin = { id: host, role: "admin", name: "Undo Host", email: "" } as User;
  const prop = async (title: string, parent: string | null) => (await one<{ id: string }>(
    `INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, status, parent_id) VALUES ($1, $2, $3, 'Pittsburgh', 4, 10000, 'published', $4) RETURNING id`,
    [`undo-${tag}-${title.toLowerCase().replace(/\W+/g, "-")}`, host, `Undo ${tag} ${title}`, parent]))!.id;
  houseId = await prop("House", null);
  roomId = await prop("Room", houseId);
  soloId = await prop("Solo", null);
  airbnbFeed = (await one<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Airbnb', 'https://example.com/u1.ics') RETURNING id", [roomId]))!.id;
  // Solo is listed on Airbnb too (its link isn't synced in these tests); House and Room only through the Room's Airbnb link.
  await q("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Airbnb', 'https://example.com/u3.ics')", [soloId]);
  bookingFeed = (await one<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Booking.com', 'https://example.com/u2.ics') RETURNING id", [soloId]))!.id;
});
after(async () => { await pool.end(); });

/** Every reservation and blocked range on the test listings, as comparable text (timestamps that only record "when touched" left out). */
async function state() {
  const res = await q<{ r: Record<string, unknown> }>(
    "SELECT to_jsonb(c) - 'updated_at' - 'last_seen_at' AS r FROM channel_reservations c WHERE property_id = ANY($1) ORDER BY id", [props()]);
  const blocks = await q("SELECT property_id, start_date, end_date, source FROM blocks WHERE property_id = ANY($1) ORDER BY source, start_date", [props()]);
  return JSON.stringify({ res: res.map(x => x.r), blocks });
}

const importCsv = async (channel: string, csv: string, defaultProperty: string | null, fileName: string) => {
  const rows = parseCsv(csv);
  const { records } = toRecords(rows.slice(1), guessMapping(rows[0]));
  const listings = (await financeListings(admin)).filter(l => props().includes(l.id));
  return applyPayoutRecords(listings, records, { channel, defaultProperty, markReceived: false, dryRun: false, today: T, userId: admin.id, fileName });
};

test("day-first files (Booking.com, Europe) are read day-first even when a date like 05/11 could be either", () => {
  assert.equal(dateOrder(["05/11/2026", "20/11/2026"]), "dmy");
  assert.equal(dateOrder(["11/05/2026", "11/20/2026"]), "mdy");
  assert.equal(dateOrder(["05.11.2026"]), "dmy");
  const rows = parseCsv("Book number,Arrival,Departure,Guest name\n1234567890,05/11/2026,08/11/2026,Ana Lopez\n2234567890,20/11/2026,22/11/2026,Bo Chen");
  const { records } = toRecords(rows.slice(1), guessMapping(rows[0]));
  assert.deepEqual(records.map(r => [r.check_in, r.check_out]), [["2026-11-05", "2026-11-08"], ["2026-11-20", "2026-11-22"]]);
});

test("undo removes only what one import added, puts back what it changed, and can itself be reversed", async () => {
  // Before the imports: Airbnb stays from the calendar link, one with a name a host typed in; a Booking.com stay waiting to be confirmed;
  // a reservation entered by hand; and a direct Sevgio booking.
  const a1 = ev(addDays(T, 10), addDays(T, 13), "Reserved", "u-a1", `Reservation URL: https://www.airbnb.com/hosting/reservations/details/${code("A1")}`);
  const a2 = ev(addDays(T, 20), addDays(T, 22), "Reserved", "u-a2", `Reservation URL: https://www.airbnb.com/hosting/reservations/details/${code("A2")}`);
  await applyFeedEvents({ id: airbnbFeed, property_id: roomId }, "airbnb", [a1, a2], T);
  await q("UPDATE channel_reservations SET guest_name = 'Typed Name', guest_name_source = 'manual' WHERE ical_uid = 'u-a2' AND feed_id = $1", [airbnbFeed]);
  await applyFeedEvents({ id: bookingFeed, property_id: soloId }, "bookingcom", [ev(addDays(T, 30), addDays(T, 33), "CLOSED - Not available", "u-b1")], T);
  await q(`INSERT INTO channel_reservations (property_id, channel, kind, kind_locked, source, check_in, check_out, summary, guest_name, guest_name_source)
           VALUES ($1, 'vrbo', 'reservation', true, 'manual', $2, $3, 'Vrbo: Reserved', 'Hand Entered', 'manual')`, [soloId, addDays(T, 40), addDays(T, 43)]);
  const original = await state();

  // Import 1 (Airbnb): fills in one stay, adds a stay nobody had, and one line that overlaps the hand-entered reservation.
  const air = await importCsv("airbnb", [
    "Confirmation code,Guest name,Start date,End date,Listing,Earnings",
    `${code("A1")},Ana Lopez,${addDays(T, 10)},${addDays(T, 13)},,$400.00`,
    `${code("A2")},Wrong Name,${addDays(T, 20)},${addDays(T, 22)},,$300.00`,
    `${code("N9")},Cy Dee,${addDays(T, 50)},${addDays(T, 52)},,$200.00`,
    `${code("O1")},Dup Guest,${addDays(T, 41)},${addDays(T, 44)},,$100.00`,
  ].join("\n"), soloId, "airbnb.csv");
  assert.deepEqual([air.updated, air.created, air.skipped], [2, 1, 1]);
  assert.match(air.outcomes.find(o => o.ref === code("O1"))!.reason!, /already has a Vrbo stay/);
  // A listing with no Vrbo link never gets a Vrbo stay from a file.
  const vrbo = await importCsv("vrbo", `Reservation ID,Guest name,Check-in,Check-out\nHA-${K},Not Here,${addDays(T, 90)},${addDays(T, 92)}`, soloId, "vrbo.csv");
  assert.deepEqual([vrbo.created, vrbo.skipped], [0, 1]);
  assert.match(vrbo.outcomes[0].reason!, /isn't connected to Vrbo/);
  const afterAirbnb = await state();

  // Import 2 (Booking.com): confirms the unclear stay and adds one more.
  const bk = await importCsv("bookingcom", [
    "Book number,Guest name,Arrival,Departure,Price",
    `4000000001,Eve Fox,${addDays(T, 30)},${addDays(T, 33)},500 USD`,
    `4000000002,Gus Hill,${addDays(T, 60)},${addDays(T, 61)},90 USD`,
  ].join("\n"), soloId, "booking.csv");
  assert.deepEqual([bk.updated, bk.created], [1, 1]);
  const [confirmed] = await q<{ kind: string; kind_locked: boolean; guest_name: string }>("SELECT kind, kind_locked, guest_name FROM channel_reservations WHERE feed_id = $1", [bookingFeed]);
  assert.deepEqual(confirmed, { kind: "reservation", kind_locked: true, guest_name: "Eve Fox" });

  // The Booking.com review lists exactly its two reservations.
  const changes = await importChanges(bk.importId!);
  assert.deepEqual(changes.map(c => [c.action, undoStep(c, false).action]).sort(), [["create", "remove"], ["update", "restore"]]);

  // Undo the Booking.com import only: back to exactly how things were after the Airbnb import.
  const r2 = await undoImport(bk.importId!, admin.id, T);
  assert.deepEqual(r2, { removed: 1, restored: 1, untouched: 0 });
  assert.equal(await state(), afterAirbnb);
  await assert.rejects(() => undoImport(bk.importId!, admin.id, T), /already undone/);

  // A host fixes a name after the Airbnb import; undo keeps that and puts everything else back.
  await q("UPDATE channel_reservations SET guest_name = 'Ana María Lopez', guest_name_source = 'manual' WHERE external_ref = '" + code("A1") + "'");
  const r1 = await undoImport(air.importId!, admin.id, T);
  assert.deepEqual(r1, { removed: 1, restored: 2, untouched: 0 });
  const a1Row = await one<{ guest_name: string; rent_cents: number | null; finance_source: string; kind_locked: boolean }>(
    "SELECT guest_name, rent_cents, finance_source, kind_locked FROM channel_reservations WHERE external_ref = '" + code("A1") + "'");
  assert.deepEqual(a1Row, { guest_name: "Ana María Lopez", rent_cents: null, finance_source: "none", kind_locked: false });
  await q("UPDATE channel_reservations SET guest_name = '', guest_name_source = '' WHERE external_ref = '" + code("A1") + "'");
  assert.equal(await state(), original, "every reservation, the typed-in name, the hand-entered stay and all blocked dates exactly as before the imports");
  const backups = await q("SELECT 1 FROM channel_import_backups WHERE import_id = $1", [air.importId]);
  assert.equal(backups.length, 3, "every affected row was copied before the undo");

  // Put back: the Airbnb import's reservation and changes return.
  assert.equal(await putBackImport(air.importId!, T), 3);
  assert.equal((await q("SELECT 1 FROM channel_reservations WHERE external_ref = '" + code("N9") + "'")).length, 1);
  assert.equal((await q("SELECT 1 FROM blocks b JOIN channel_reservations c ON b.source = 'res:' || c.id WHERE c.external_ref = '" + code("N9") + "'")).length, 1);
  // Exactly as just before the undo: the import's payout, and the name the host had typed.
  assert.deepEqual(await one("SELECT guest_name, expected_payout_cents FROM channel_reservations WHERE external_ref = $1", [code("A1")]), { guest_name: "Ana María Lopez", expected_payout_cents: 40000 });
  await undoImport(air.importId!, admin.id, T);
  await q("UPDATE channel_reservations SET guest_name = '', guest_name_source = '' WHERE external_ref = $1", [code("A1")]);
  assert.equal(await state(), original);
});

test("imports made before history existed are found by time and can be undone", async () => {
  // Earlier runs' leftovers in the test database.
  await q("UPDATE channel_imports SET legacy = false WHERE legacy");
  await q("DELETE FROM channel_reservations WHERE source = 'import' AND id NOT IN (SELECT reservation_id FROM channel_import_changes)");
  // As an old import left things: a reservation it added (no link to the import), and a calendar stay it filled in and locked.
  const added = (await one<{ id: string }>(
    `INSERT INTO channel_reservations (property_id, channel, kind, kind_locked, source, external_ref, check_in, check_out, summary, guest_name, guest_name_source, ref_source, created_at)
     VALUES ($1, 'airbnb', 'reservation', true, 'import', '${code("L1")}', $2, $3, 'Airbnb reservation', 'Old Import', 'import', 'import', now() - interval '12 minutes') RETURNING id`,
    [soloId, addDays(T, 70), addDays(T, 72)]))!.id;
  await q("INSERT INTO blocks (property_id, start_date, end_date, note, source) VALUES ($1, $2, $3, 'Airbnb: Reserved', $4)", [soloId, addDays(T, 70), addDays(T, 72), "res:" + added]);
  await q(`UPDATE channel_reservations SET guest_name = 'Old Name', guest_name_source = 'import', rent_cents = 5000, finance_source = 'import', kind = 'reservation', kind_locked = true,
           updated_at = now() - interval '11 minutes' WHERE feed_id = $1`, [bookingFeed]);
  const untouched = await one<{ id: string }>("SELECT id FROM channel_reservations WHERE external_ref = '" + code("A2") + "'");
  const imp = (await one<{ id: string }>(
    "INSERT INTO channel_imports (user_id, file_name, channel, rows, created, updated, created_at, legacy) VALUES ($1, 'old.csv', 'airbnb', 2, 1, 0, now() - interval '10 minutes', true) RETURNING id", [admin.id]))!.id;
  const imp2 = (await one<{ id: string }>(
    "INSERT INTO channel_imports (user_id, file_name, channel, rows, created, updated, created_at, legacy) VALUES ($1, 'old-b.csv', 'bookingcom', 1, 0, 1, now() - interval '10 minutes', true) RETURNING id", [admin.id]))!.id;
  // The migration's own matching statements.
  const sql = readFileSync(new URL("../../migrations/041_import_history.sql", import.meta.url), "utf8");
  for (const stmt of sql.split(";").filter(s => /INSERT INTO channel_import_changes/.test(s))) await q(stmt);
  const c1 = await importChanges(imp), c2 = await importChanges(imp2);
  assert.deepEqual(c1.map(c => [c.action, c.reservation_id]), [["create", added]]);
  assert.deepEqual(c2.map(c => c.action), ["update"]);
  assert.ok(!c1.concat(c2).some(c => c.reservation_id === untouched!.id));

  await undoImport(imp, admin.id, T);
  await undoImport(imp2, admin.id, T);
  assert.equal((await q("SELECT 1 FROM channel_reservations WHERE id = $1", [added])).length, 0);
  assert.equal((await q("SELECT 1 FROM blocks WHERE source = $1", ["res:" + added])).length, 0);
  const b = await one("SELECT guest_name, rent_cents, finance_source, kind, kind_locked FROM channel_reservations WHERE feed_id = $1", [bookingFeed]);
  assert.deepEqual(b, { guest_name: "", rent_cents: null, finance_source: "none", kind: "unknown", kind_locked: false });
});

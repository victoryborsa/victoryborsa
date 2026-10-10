import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DB, iso, signIn, signOut, sql } from "./helpers.ts";

// Airbnb, Booking.com and Vrbo calendars as each site writes them, synced by the real sync code, then checked in Upcoming and Past.
const d = (n: number) => iso(n).replaceAll("-", "");
const ics = (events: [string, number, number, string, string?][]) => ["BEGIN:VCALENDAR", "VERSION:2.0",
  ...events.flatMap(([uid, from, to, summary, desc]) => ["BEGIN:VEVENT", `UID:${uid}`, `DTSTART;VALUE=DATE:${d(from)}`, `DTEND;VALUE=DATE:${d(to)}`, `SUMMARY:${summary}`, ...(desc ? [`DESCRIPTION:${desc}`] : []), "END:VEVENT"]),
  "END:VCALENDAR"].join("\r\n");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feeds-"));
function sync(feed: string, text: string) {
  const file = path.join(dir, feed + ".ics");
  fs.writeFileSync(file, text);
  return JSON.parse(execFileSync("node", ["--experimental-strip-types", "--no-warnings", "tests/e2e/feed-sync.ts", feed, file], { env: { ...process.env, DATABASE_URL: DB } }).toString());
}
const row = (page: Page, platform: string, text: string | RegExp) => page.locator(`tbody tr[data-platform=${platform}]`, { hasText: text });
const U = 520, P = -70; // far from other tests' dates

const AIRBNB = [
  ["air-1@airbnb.com", U + 5, U + 8, "Reserved", "Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMPLAT0001\\nPhone Number (Last 4 Digits): 4321"],
  ["air-2@airbnb.com", U + 30, U + 32, "Airbnb (Not available)"],
  ["air-3@airbnb.com", P, P + 3, "Reserved", "Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMPLAT0002"],
  ["air-4@airbnb.com", -2, 3, "Reserved", "Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMPLAT0003"],
] as [string, number, number, string, string?][];
const VRBO = [
  ["vrbo-1", U + 10, U + 13, "Reserved - Chris Vale"],
  ["vrbo-2", U + 40, U + 44, "Blocked"], // a Vrbo reservation labelled Blocked
  ["vrbo-3", U + 5, U + 8, "Blocked"], // Airbnb's stay copied into Vrbo's calendar
  ["vrbo-4", P + 10, P + 13, "Blocked"],
] as [string, number, number, string, string?][];
const BDC = [
  ["bdc-1@booking.com", U + 20, U + 23, "CLOSED - Not available"],
  ["bdc-2@booking.com", P + 20, P + 22, "CLOSED - Not available"],
] as [string, number, number, string, string?][];

test.describe.serial("reservations from Airbnb, Booking.com and Vrbo in Upcoming and Past", () => {
  const feeds: Record<string, string> = {};

  test.beforeAll(async () => {
    const [h] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'dana@demo.sevgio.com'");
    const [{ id: house }] = await sql<{ id: string }>(
      "INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, status) VALUES ('plat-test-house', $1, 'Platform Test House', 'Pittsburgh', 6, 20000, 'published') RETURNING id", [h.id]);
    const [{ id: room }] = await sql<{ id: string }>(
      "INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, status, parent_id) VALUES ('plat-test-room', $1, 'Rose Room', 'Pittsburgh', 2, 9000, 'published', $2) RETURNING id", [h.id, house]);
    for (const [k, name, prop] of [["air", "Airbnb", room], ["vrbo", "Vrbo", house], ["bdc", "Booking.com", house]]) {
      [{ id: feeds[k] }] = await sql<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, $2, $3) RETURNING id", [prop, name, `https://127.0.0.1/plat-${k}.ics`]);
    }
    sync(feeds.air, ics(AIRBNB));
    sync(feeds.vrbo, ics(VRBO));
    sync(feeds.bdc, ics(BDC));
  });

  test.afterAll(async () => {
    await sql("DELETE FROM blocks WHERE property_id IN (SELECT id FROM properties WHERE slug LIKE 'plat-test-%')");
    await sql("DELETE FROM channel_reservations WHERE property_id IN (SELECT id FROM properties WHERE slug LIKE 'plat-test-%')");
    await sql("DELETE FROM ical_feeds WHERE url LIKE 'https://127.0.0.1/plat-%'");
    await sql("DELETE FROM properties WHERE slug = 'plat-test-room'");
    await sql("DELETE FROM properties WHERE slug = 'plat-test-house'");
  });

  test("every platform's stays are listed; blocked dates and copies are not; past stays go to Past", async ({ page }) => {
    await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
    await page.goto("/host/bookings?view=upcoming");
    await expect(row(page, "airbnb", "HMPLAT0001")).toContainText("Platform Test House › Rose Room");
    await expect(row(page, "airbnb", "HMPLAT0001")).toContainText("Confirmed");
    await expect(row(page, "vrbo", "Chris Vale")).toContainText("Confirmed");
    await expect(row(page, "airbnb", "HMPLAT0001")).toContainText("Phone ends in 4321");
    await expect(row(page, "airbnb", "HMPLAT0001")).toContainText("Not provided by Airbnb");
    await expect(row(page, "airbnb", "HMPLAT0001")).toContainText("Calendar details only");
    await expect(row(page, "airbnb", "HMPLAT0001")).toContainText("Payment unavailable");
    await expect(row(page, "vrbo", "External Calendar Block")).toHaveCount(1); // the one labelled "Blocked" (its copy of the Airbnb stay is left out)
    await expect(row(page, "vrbo", "External Calendar Block")).toContainText("Vrbo shows these dates as “Blocked”");
    const bdc = row(page, "bookingcom", "Platform Test House");
    await expect(bdc).toContainText("External Calendar Block");
    await expect(bdc).toContainText("Booking.com shows these dates as “CLOSED - Not available”");
    await expect(bdc).toContainText("External Calendar Block");
    await expect(bdc).toContainText("No guest details");
    await expect(bdc).toContainText("Dates only, from the Booking.com calendar link.");
    await expect(bdc).not.toContainText("Missing");
    await expect(bdc).not.toContainText("Unconfirmed");
    await expect(bdc).not.toContainText("Payment unavailable");
    await expect(bdc).toContainText("Upcoming");
    await expect(bdc).not.toContainText("Paid on");
    // The stay going on now is under Staying now, not Upcoming.
    await expect(row(page, "airbnb", "HMPLAT0003")).toHaveCount(0);
    await expect(page.locator("tbody tr", { hasText: "Platform Test House" })).toHaveCount(4);
    if (process.env.GN_SHOTS) await page.screenshot({ path: `${process.env.GN_SHOTS}/computer-all-platforms-before-check.png`, fullPage: true });

    await page.getByRole("tab", { name: "Staying now" }).click();
    await expect(row(page, "airbnb", "HMPLAT0003")).toContainText("Checked In");
    await page.getByRole("tab", { name: "Past" }).click();
    await expect(row(page, "airbnb", "HMPLAT0002")).toContainText("Checked Out");
    await expect(row(page, "vrbo", "Platform Test House")).toHaveCount(1);
    await expect(row(page, "bookingcom", "Platform Test House")).toHaveCount(1);
    await expect(page.locator("tbody tr", { hasText: "Platform Test House" })).toHaveCount(3);

    // The calendar shows the same stays.
    await page.goto(`/host/calendar?view=month&start=${iso(U + 20).slice(0, 8)}01`);
    await expect(page.locator("[data-stay]", { hasText: "Booking.com" }).first()).toBeVisible();
    await signOut(page);
  });

  test("the host sorts the unclear ones; changes and cancellations update without duplicates", async ({ page }) => {
    await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
    await page.goto("/host/bookings?view=upcoming");
    // Reservations and blocks from other sites are read-only: no buttons to reclassify them or type details in.
    await expect(row(page, "bookingcom", "Platform Test House").getByText("Know what it is?")).toHaveCount(0);
    await expect(row(page, "bookingcom", "Platform Test House").getByText("Add details")).toHaveCount(0);
    // What a Booking.com reservations file and a Vrbo owner-hold record would set (imports still work).
    await sql("UPDATE channel_reservations SET kind = 'reservation', kind_locked = true, guest_name = 'Ines Duarte', guest_name_source = 'import', external_ref = '4455112233', ref_source = 'import' WHERE feed_id = $1 AND ical_uid = 'bdc-1@booking.com'", [feeds.bdc]);
    await sql("UPDATE channel_reservations SET kind = 'blocked', kind_locked = true WHERE feed_id = $1 AND ical_uid = 'vrbo-2'", [feeds.vrbo]);
    await page.reload();
    await expect(row(page, "bookingcom", "Platform Test House")).toContainText(/Confirmed\s*on Booking\.com/);
    await expect(row(page, "vrbo", "External Calendar Block")).toHaveCount(0);
    await expect(page.locator("tbody tr", { hasText: "Platform Test House" })).toHaveCount(3);

    // Next refresh: Booking.com moves a day later, Chris Vale cancels on Vrbo; everything else is the same.
    sync(feeds.bdc, ics(BDC.map(e => e[0] === "bdc-1@booking.com" ? [e[0], U + 21, U + 24, e[3]] : e)));
    sync(feeds.vrbo, ics(VRBO.filter(e => e[0] !== "vrbo-1")));
    sync(feeds.air, ics(AIRBNB));
    await page.reload();
    await expect(row(page, "bookingcom", "Platform Test House")).toHaveCount(1);
    await expect(row(page, "bookingcom", "Platform Test House")).toContainText(/Confirmed\s*on Booking\.com/); // the host's choice is kept
    await expect(row(page, "bookingcom", "Platform Test House")).toContainText("4455112233"); // and the typed details
    await expect(row(page, "bookingcom", "Platform Test House")).toContainText("Ines Duarte");
    await expect(row(page, "bookingcom", "Platform Test House")).toContainText("Complete");
    await expect(row(page, "vrbo", "Chris Vale")).toHaveCount(0);
    await expect(page.locator("tbody tr", { hasText: "Platform Test House" })).toHaveCount(2);
    await page.getByRole("tab", { name: "Cancelled & declined" }).click();
    await expect(row(page, "vrbo", "Chris Vale")).toContainText("Cancelled");
    const counts = await sql<{ n: number }>("SELECT count(*)::int AS n FROM channel_reservations WHERE feed_id = ANY($1)", [Object.values(feeds)]);
    expect(counts[0].n).toBe(AIRBNB.length + VRBO.length + BDC.length);
    if (process.env.GN_SHOTS) {
      await page.goto("/host/bookings?view=upcoming");
      await page.screenshot({ path: `${process.env.GN_SHOTS}/computer-all-platforms-after-check.png`, fullPage: true });
    }
    await signOut(page);
  });

  test("admin Bookings search shows the same open questions, with the fixes right under each result", async ({ page }) => {
    sync(feeds.bdc, ics([...BDC.map(e => e[0] === "bdc-1@booking.com" ? [e[0], U + 21, U + 24, e[3]] as typeof e : e), ["bdc-3@booking.com", U + 60, U + 62, "CLOSED - Not available"]]));
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto("/admin/bookings?when=upcoming");
    const item = page.locator(".rs-list li", { hasText: "Platform Test House" }).filter({ hasText: "External Calendar Block" });
    await expect(item).toHaveCount(1);
    await expect(item).toContainText("External Calendar Block");
    await expect(item).toContainText("Booking.com shows these dates as “CLOSED - Not available”");
    await expect(item).not.toContainText("Missing");
    // Read-only: no form to type details in. A Booking.com reservations file with the guest and number confirms it.
    await expect(item.getByText("Add reservation details")).toHaveCount(0);
    await sql("UPDATE channel_reservations SET kind = 'reservation', kind_locked = true, guest_name = 'Tomas Berg', guest_name_source = 'import', external_ref = '4455998877', ref_source = 'import' WHERE feed_id = $1 AND ical_uid = 'bdc-3@booking.com'", [feeds.bdc]);
    await page.reload();
    await expect(page.locator(".rs-list li", { hasText: "Platform Test House" }).filter({ hasText: "External Calendar Block" })).toHaveCount(0);
    await page.goto("/admin/bookings?q=berg");
    await expect(page.locator(".rs-list li", { hasText: "4455998877" })).toContainText("Tomas Berg");
    await expect(page.locator(".rs-list li", { hasText: "4455998877" })).not.toContainText("Missing");
    if (process.env.GN_SHOTS) {
      await page.goto("/admin/bookings?when=upcoming");
      await page.screenshot({ path: `${process.env.GN_SHOTS}/computer-admin-upcoming.png`, fullPage: true });
    }
    await signOut(page);
  });

  test("Airbnb's reservations download fills in guest names; the notice says how many are still missing", async ({ page }) => {
    await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
    await page.goto("/host/bookings?view=upcoming");
    await expect(page.getByRole("status").filter({ hasText: "no guest name" })).toContainText("from Airbnb");
    await page.getByRole("link", { name: "Import a reservations file" }).click();
    await expect(page.getByRole("heading", { name: "Get guest names and booking references" })).toBeVisible();
    // Airbnb › Reservations › Export › Download CSV file, as Airbnb writes it.
    const csv = ["Confirmation code,Status,Guest name,Contact,# of adults,# of children,# of infants,Start date,End date,# of nights,Booked,Listing,Earnings",
      `HMPLAT0001,Confirmed,Jordan Lee,"+1 (412) 555-4321",2,0,0,${iso(U + 5).slice(5, 7)}/${iso(U + 5).slice(8)}/${iso(U + 5).slice(0, 4)},${iso(U + 8).slice(5, 7)}/${iso(U + 8).slice(8)}/${iso(U + 8).slice(0, 4)},3,2026-09-30,Rose Room,"$412.50"`].join("\n");
    await page.getByLabel("Payout or earnings file (CSV)").setInputFiles({ name: "reservations.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByLabel("Which site is it from?").selectOption("airbnb");
    await page.getByRole("button", { name: "Check file" }).click();
    await expect(page.locator("tr", { hasText: "HMPLAT0001" })).toContainText("Update");
    await page.getByRole("button", { name: /Import 1 reservation/ }).click();
    await expect(page.getByText(/1 reservation updated/)).toBeVisible();
    await page.goto("/host/bookings?view=upcoming");
    await expect(row(page, "airbnb", "HMPLAT0001")).toContainText("Jordan Lee");
    await expect(row(page, "airbnb", "HMPLAT0001")).toContainText("From payout file");
    await expect(row(page, "airbnb", "HMPLAT0001")).toContainText("2 guests");
    await expect(row(page, "airbnb", "HMPLAT0001")).toContainText("expected from Airbnb");
    await signOut(page);
  });
  test("a Booking.com file import can be reviewed and undone without touching anything else, and the undo reversed", async ({ page }) => {
    const dmy = (n: number) => { const [y, m, dd] = iso(n).split("-"); return `${dd}/${m}/${y}`; };
    const before = await sql<{ n: number }>("SELECT count(*)::int AS n FROM channel_reservations WHERE property_id IN (SELECT id FROM properties WHERE slug LIKE 'plat-test-%')");
    await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
    await page.goto("/host/finance/import");
    // Booking.com › Reservations › Download, day-first dates. One stay nobody has yet, one overlapping the synced Booking.com stay.
    const csv = ["Book number,Booked by,Guest name(s),Check-in,Check-out,Status,People,Price,Commission amount",
      `4000111222,Ola Nordmann,Ola Nordmann,${dmy(U + 80)},${dmy(U + 82)},ok,2,300 USD,45 USD`,
      `4000111333,Dup Guest,Dup Guest,${dmy(U + 21)},${dmy(U + 23)},ok,2,300 USD,45 USD`].join("\n");
    await page.getByLabel("Payout or earnings file (CSV)").setInputFiles({ name: "booking-res.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByLabel("Which site is it from?").selectOption("bookingcom");
    const house = await page.locator("select[name=default_property] option", { hasText: /on Platform Test House$/ }).getAttribute("value");
    await page.getByLabel("Lines that match no reservation").selectOption(house!);
    await page.getByRole("button", { name: "Check file" }).click();
    await expect(page.locator("tr", { hasText: "4000111222" })).toContainText("Add new");
    await expect(page.locator("tr", { hasText: "4000111333" })).toContainText("already has a Booking.com stay");
    await expect(page.getByRole("note").filter({ hasText: "will be added as new reservation" })).toBeVisible();
    await page.getByRole("button", { name: /Import 1 reservation/ }).click();
    await expect(page.getByText(/0 reservations updated, 1 added/)).toBeVisible();
    const [added] = await sql<{ id: string; check_in: string }>("SELECT id, check_in::text FROM channel_reservations WHERE external_ref = '4000111222'");
    expect(added.check_in).toBe(iso(U + 80));
    expect((await sql("SELECT 1 FROM blocks WHERE source = $1", ["res:" + added.id])).length).toBe(1);

    // From Bookings: the recent-imports notice leads to the review page.
    await page.goto("/host/bookings?view=upcoming");
    await expect(row(page, "bookingcom", "4000111222")).toHaveCount(1);
    await page.getByRole("status").filter({ hasText: "Recent file imports" }).locator("li", { hasText: "booking-res.csv" }).getByRole("link", { name: "Review or undo" }).click();
    await expect(page.getByRole("table", { name: "Added by this import" })).toContainText("4000111222");
    await page.getByRole("button", { name: "Undo this import" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Import undone" })).toBeVisible();
    expect((await sql("SELECT 1 FROM channel_reservations WHERE external_ref = '4000111222'")).length).toBe(0);
    expect((await sql("SELECT 1 FROM blocks WHERE source = $1", ["res:" + added.id])).length).toBe(0);
    const after = await sql<{ n: number }>("SELECT count(*)::int AS n FROM channel_reservations WHERE property_id IN (SELECT id FROM properties WHERE slug LIKE 'plat-test-%')");
    expect(after[0].n).toBe(before[0].n);
    await page.goto("/host/bookings?view=upcoming");
    await expect(row(page, "bookingcom", "4000111222")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "booking-res.csv" })).toHaveCount(0);

    // Put it back, then undo again.
    await page.goto("/host/finance/import");
    await expect(page.locator("tr", { hasText: "booking-res.csv" })).toContainText("Undone");
    await page.locator("tr", { hasText: "booking-res.csv" }).getByRole("link", { name: "Review" }).click();
    await page.getByRole("button", { name: "Put it back" }).click();
    await expect(page.getByRole("status").filter({ hasText: "put back" })).toBeVisible();
    expect((await sql("SELECT 1 FROM channel_reservations WHERE id = $1", [added.id])).length).toBe(1);
    expect((await sql("SELECT 1 FROM blocks WHERE source = $1", ["res:" + added.id])).length).toBe(1);
    await page.getByRole("button", { name: "Undo this import" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Import undone" })).toBeVisible();
    expect((await sql("SELECT 1 FROM channel_reservations WHERE external_ref = '4000111222'")).length).toBe(0);
    await signOut(page);
  });
  test("Calendar sync shows each link's health; a failing link is retried, reported and emailed to admins without stopping the others", async ({ page }) => {
    const [{ id: house }] = await sql<{ id: string }>("SELECT id FROM properties WHERE slug = 'plat-test-house'");
    const [{ id: bad }] = await sql<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Vrbo', 'https://127.0.0.1/plat-bad.ics') RETURNING id", [house]);
    try {
      await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
      await page.goto("/host/calendar-sync");
      await expect(page.getByRole("heading", { name: "Calendar sync" })).toBeVisible();
      const started = new Date().toISOString();
      await page.getByRole("button", { name: "Sync all now" }).click();
      await expect(page.getByRole("status").filter({ hasText: /Synced \d+ calendar links; \d+ failed/ })).toBeVisible({ timeout: 60_000 }); // each failing link is retried once after 2 seconds
      const badRow = page.locator(`tr[data-feed="${bad}"]`);
      await expect(badRow).toHaveAttribute("data-state", "failing");
      await expect(badRow).toContainText("1 failed try in a row");
      await expect(badRow).toContainText("that address isn't allowed");
      await expect(page.getByRole("link", { name: /Calendar sync/ })).toContainText(/\d/);
      // One failing link doesn't stop the rest: every other link of the house was tried in the same run.
      const tried = await sql<{ n: number }>("SELECT count(*)::int AS n FROM ical_feeds WHERE url LIKE 'https://127.0.0.1/plat-%' AND id <> $2 AND last_attempt_at >= $1", [started, bad]);
      expect(tried[0].n).toBe(3);
      // Third failure in a row: admins are emailed once.
      await sql("UPDATE ical_feeds SET fail_count = 2 WHERE id = $1", [bad]);
      await badRow.getByRole("button", { name: "Sync now" }).click();
      await expect(badRow).toContainText("3 failed tries in a row", { timeout: 30_000 });
      await expect(badRow).toContainText("Admins emailed");
      await signOut(page);
    } finally {
      await sql("DELETE FROM ical_feeds WHERE id = $1", [bad]);
    }
  });
});

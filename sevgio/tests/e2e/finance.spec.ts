import { test, expect } from "@playwright/test";
import { iso, signIn, signOut, sql } from "./helpers.ts";

const add = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
// A month nobody else's tests use: the 3rd of the month ~20 months out.
const D = iso(620).slice(0, 8) + "03";
const FROM = D.slice(0, 8) + "01";
const TO = add(new Date(Date.UTC(Number(D.slice(0, 4)), Number(D.slice(5, 7)), 0)).toISOString().slice(0, 10), 0);

test.describe.serial("finance with reservations from other sites", () => {
  let house = "", room = "";

  test.beforeAll(async () => {
    const [h] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'dana@demo.sevgio.com'");
    [{ id: house }] = await sql<{ id: string }>(
      "INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, status, management_fee_percent) VALUES ('fin-test-house', $1, 'Finance Test House', 'Pittsburgh', 6, 20000, 'published', 10) RETURNING id", [h.id]);
    [{ id: room }] = await sql<{ id: string }>(
      "INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, status, parent_id) VALUES ('fin-test-room', $1, 'Garden Room', 'Pittsburgh', 2, 9000, 'published', $2) RETURNING id", [h.id, house]);
    const [air] = await sql<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Airbnb', 'https://example.com/fin-air.ics') RETURNING id", [room]);
    const [bdc] = await sql<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Booking.com', 'https://example.com/fin-bdc.ics') RETURNING id", [house]);
    // What a calendar sync stores: an Airbnb reservation with its code (dates only, no money), and a Booking.com "CLOSED" period.
    await sql("INSERT INTO channel_reservations (property_id, feed_id, channel, kind, ical_uid, external_ref, check_in, check_out, summary) VALUES ($1, $2, 'airbnb', 'reservation', 'fin-a', 'HMFINTEST1', $3, $4, 'Reserved')",
      [room, air.id, D, add(D, 4)]);
    await sql("INSERT INTO channel_reservations (property_id, feed_id, channel, kind, ical_uid, check_in, check_out, summary) VALUES ($1, $2, 'bookingcom', 'unknown', 'fin-b', $3, $4, 'CLOSED - Not available')",
      [house, bdc.id, add(D, 10), add(D, 13)]);
  });

  test.afterAll(async () => {
    await sql("DELETE FROM blocks WHERE property_id IN (SELECT id FROM properties WHERE slug LIKE 'fin-test-%')");
    await sql("DELETE FROM channel_reservations WHERE property_id IN (SELECT id FROM properties WHERE slug LIKE 'fin-test-%')");
    await sql("DELETE FROM ical_feeds WHERE url LIKE 'https://example.com/fin-%'");
    await sql("DELETE FROM properties WHERE slug = 'fin-test-room'");
    await sql("DELETE FROM properties WHERE slug = 'fin-test-house'");
  });

  test("synced reservations show up with 'Needs entry' instead of $0, and unclear periods can be sorted", async ({ page }) => {
    await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
    await page.goto(`/host/finance?from=${FROM}&to=${TO}&property=${house}`);
    await expect(page.getByText("Some numbers are incomplete")).toBeVisible();
    await expect(page.locator(".stat", { hasText: "Reservations checking in" }).locator("b")).toHaveText("1");
    await expect(page.locator(".stat", { hasText: "Rental income" })).toContainText("Needs entry");
    await expect(page.locator(".stat", { hasText: "Nights booked" }).locator("b")).toHaveText("4");
    const row = page.locator("tr[data-res='HMFINTEST1']");
    await expect(row).toContainText("Airbnb");
    await expect(row).toContainText("Needs entry");

    // The Booking.com period is a reservation: once marked, it counts.
    await page.getByRole("link", { name: "See them" }).click();
    await expect(page.locator("tr", { hasText: "Finance Test House" })).toContainText("External Calendar Block");
    await page.locator("tr", { hasText: "Finance Test House" }).getByRole("link", { name: "Open" }).click();
    // Reservations from other sites are read-only: no way to reclassify the block by hand.
    await expect(page.getByTestId("external-readonly")).toBeVisible();
    await expect(page.getByText("Know what it is?")).toHaveCount(0);
    // A matching Booking.com reservations file confirms it (same effect as an import).
    await sql("UPDATE channel_reservations SET kind = 'reservation', kind_locked = true WHERE channel = 'bookingcom' AND property_id = $1", [house]);
    await page.reload();
    await expect(page.getByRole("heading", { name: /Booking.com reservation/ })).toBeVisible();
    await page.goto("/host/bookings/other-sites?kind=unknown");
    await expect(page.locator("tr", { hasText: "Finance Test House" })).toHaveCount(0);
    await page.goto(`/host/finance?from=${FROM}&to=${TO}&property=${house}`);
    await expect(page.locator(".stat", { hasText: "Reservations checking in" }).locator("b")).toHaveText("2");
    // Whole-home Booking.com (3 nights) fills the room too; the room's Airbnb stay adds 4 room-nights: 7 of the month's room-nights.
    await expect(page.locator(".stat", { hasText: "Nights booked" }).locator("b")).toHaveText("7");

    // A stay whose dates changed on the other site still lists (this page used to crash on it).
    await sql("UPDATE channel_reservations SET modified_at = '2026-10-06T04:30:00Z' WHERE external_ref = 'HMFINTEST1'");
    await page.goto(`/host/bookings/other-sites?when=all&property=${house}`);
    await expect(page.locator("tr", { hasText: "HMFINTEST1" })).toContainText("Dates changed Oct 6");
    await sql("UPDATE channel_reservations SET modified_at = NULL WHERE external_ref = 'HMFINTEST1'");
    await signOut(page);
  });

  test("a payout file fills in the money; Finance, statement CSV and calendar agree", async ({ page }) => {
    await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
    await page.goto("/host/finance/import");
    const csv = [
      "Date,Type,Confirmation Code,Start Date,Nights,Guest,Listing,Amount,Paid Out,Service Fee,Cleaning Fee,Gross Earnings,Occupancy Taxes",
      `${D},Payout,,,,,,,612.00,,,,`,
      `${D},Reservation,HMFINTEST1,${D},4,Pat Rivera,Garden Room,612.00,,18.00,30.00,630.00,0`,
    ].join("\n");
    await page.getByLabel("Payout or earnings file (CSV)").setInputFiles({ name: "airbnb.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByLabel("Which site is it from?").selectOption("airbnb");
    await page.getByRole("button", { name: "Check file" }).click();
    await expect(page.getByText("What will happen (nothing saved yet)")).toBeVisible();
    await expect(page.locator("tr", { hasText: "HMFINTEST1" })).toContainText("Update");
    await expect(page.locator("select[name=map_ref]")).toHaveValue("2");
    await page.getByLabel(/already reached my bank/).check();
    await page.getByRole("button", { name: /Import 1 reservation/ }).click();
    await expect(page.getByText(/Imported airbnb.csv: 1 reservation updated/)).toBeVisible();

    await page.goto(`/host/finance?from=${FROM}&to=${TO}&property=${house}&channel=airbnb`);
    const row = page.locator("tr[data-res='HMFINTEST1']");
    await expect(row).toContainText("Pat Rivera");
    await expect(row).toContainText("$600"); // rent = gross $630 − $30 cleaning
    await expect(row).toContainText("$18");
    await expect(row).toContainText("$612");
    await expect(page.locator(".stat", { hasText: "Expected payout" })).toContainText("$612");
    if (process.env.FIN_SHOTS) {
      await page.goto(`/host/finance?from=${FROM}&to=${TO}&property=${house}`);
      await page.screenshot({ path: `${process.env.FIN_SHOTS}/finance.png`, fullPage: true });
      await page.goto("/host/bookings/other-sites?when=all");
      await page.screenshot({ path: `${process.env.FIN_SHOTS}/other-sites.png`, fullPage: true });
      await page.goto(`/host/finance?from=${FROM}&to=${TO}&property=${house}&channel=airbnb`);
    }
    const text = await (await page.request.get(`/api/finance/statement?from=${FROM}&to=${TO}&property=${house}&channel=airbnb`)).text();
    expect(text).toContain("HMFINTEST1");
    expect(text).toMatch(/Airbnb,HMFINTEST1,Finance Test House › Garden Room,Pat Rivera,.*,600\.00,30\.00,0\.00,0\.00,18\.00,0\.00,612\.00,612\.00/);

    // The calendar's reservation panel shows the same reservation and payout.
    await page.goto(`/host/calendar?view=month&start=${FROM}&property=${house}&room=${room}`);
    await page.locator(`[data-stay]`, { hasText: "Airbnb" }).first().click();
    await expect(page.getByRole("dialog")).toContainText("HMFINTEST1");
    await expect(page.getByRole("dialog")).toContainText("$612");
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).first().click();
    await signOut(page);
  });

  test("finance page fits a phone screen", async ({ page }) => {
    await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/host/finance?from=${FROM}&to=${TO}`);
    await expect(page.locator(".fin-stats")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    if (process.env.FIN_SHOTS) await page.screenshot({ path: `${process.env.FIN_SHOTS}/phone-finance.png`, fullPage: true });
  });
});

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
      [{ id: feeds[k] }] = await sql<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, $2, $3) RETURNING id", [prop, name, `https://example.com/plat-${k}.ics`]);
    }
    sync(feeds.air, ics(AIRBNB));
    sync(feeds.vrbo, ics(VRBO));
    sync(feeds.bdc, ics(BDC));
  });

  test.afterAll(async () => {
    await sql("DELETE FROM blocks WHERE property_id IN (SELECT id FROM properties WHERE slug LIKE 'plat-test-%')");
    await sql("DELETE FROM channel_reservations WHERE property_id IN (SELECT id FROM properties WHERE slug LIKE 'plat-test-%')");
    await sql("DELETE FROM ical_feeds WHERE url LIKE 'https://example.com/plat-%'");
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
    await expect(row(page, "airbnb", "HMPLAT0001")).toContainText("Missing guest name");
    await expect(row(page, "airbnb", "HMPLAT0001")).toContainText("Payment status unavailable");
    await expect(row(page, "vrbo", "Unconfirmed")).toHaveCount(1); // the one labelled "Blocked" (its copy of the Airbnb stay is left out)
    await expect(row(page, "vrbo", "Unconfirmed")).toContainText("Vrbo marks these dates “Blocked”");
    const bdc = row(page, "bookingcom", "Platform Test House");
    await expect(bdc).toContainText("Unconfirmed");
    await expect(bdc).toContainText("Booking.com marks these dates “CLOSED - Not available”");
    await expect(bdc).toContainText("Guest name unavailable");
    await expect(bdc).toContainText("Missing reference and guest name");
    await expect(bdc).toContainText("Booking.com's calendar link never sends these.");
    await expect(bdc).toContainText("Upcoming");
    await expect(bdc).not.toContainText("Paid on");
    // The stay going on now is under Staying now, not Upcoming.
    await expect(row(page, "airbnb", "HMPLAT0003")).toHaveCount(0);
    await expect(page.locator("tbody tr", { hasText: "Platform Test House" })).toHaveCount(4);
    if (process.env.GN_SHOTS) await page.screenshot({ path: `${process.env.GN_SHOTS}/computer-all-platforms-before-check.png`, fullPage: true });

    await page.getByRole("tab", { name: "Staying now" }).click();
    await expect(row(page, "airbnb", "HMPLAT0003")).toContainText("Staying now");
    await page.getByRole("tab", { name: "Past" }).click();
    await expect(row(page, "airbnb", "HMPLAT0002")).toContainText("Checked out");
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
    await row(page, "bookingcom", "Platform Test House").getByRole("button", { name: "Yes, a guest reservation" }).click();
    await expect(row(page, "bookingcom", "Platform Test House")).toContainText("Confirmed on Booking.com");
    await row(page, "vrbo", "Unconfirmed").getByRole("button", { name: "No, dates I closed" }).click();
    await expect(row(page, "vrbo", "Unconfirmed")).toHaveCount(0);
    // The Booking.com reference and guest name, copied from the Booking.com extranet.
    const bdc = row(page, "bookingcom", "Platform Test House");
    await bdc.getByText("Add details").click();
    await bdc.getByLabel("Guest full name").fill("Ines Duarte");
    await bdc.getByLabel("Booking.com reference").fill("4455112233");
    await bdc.getByRole("button", { name: "Save details" }).click();
    await expect(bdc).toContainText("Saved.");
    await expect(page.locator("tbody tr", { hasText: "Platform Test House" })).toHaveCount(3);

    // Next refresh: Booking.com moves a day later, Chris Vale cancels on Vrbo; everything else is the same.
    sync(feeds.bdc, ics(BDC.map(e => e[0] === "bdc-1@booking.com" ? [e[0], U + 21, U + 24, e[3]] : e)));
    sync(feeds.vrbo, ics(VRBO.filter(e => e[0] !== "vrbo-1")));
    sync(feeds.air, ics(AIRBNB));
    await page.reload();
    await expect(row(page, "bookingcom", "Platform Test House")).toHaveCount(1);
    await expect(row(page, "bookingcom", "Platform Test House")).toContainText("Confirmed on Booking.com"); // the host's choice is kept
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
    const item = page.locator(".rs-list li", { hasText: "Platform Test House" }).filter({ hasText: "Unconfirmed" });
    await expect(item).toHaveCount(1);
    await expect(item).toContainText("No reference");
    await expect(item).toContainText("Booking.com marks these dates “CLOSED - Not available”");
    await expect(item).toContainText("Missing reference and guest name");
    await item.getByRole("button", { name: "Yes, a guest reservation" }).click();
    await expect(page.locator(".rs-list li", { hasText: "Platform Test House" }).filter({ hasText: "Unconfirmed" })).toHaveCount(0);
    const open = page.locator(".rs-list li", { hasText: "Platform Test House" }).filter({ hasText: "Missing reference and guest name" });
    await expect(open).toHaveCount(1);
    await open.getByText("Add details").click();
    await open.getByLabel("Guest full name").fill("Tomas Berg");
    await open.getByLabel("Booking.com reference").fill("4455998877");
    await open.getByRole("button", { name: "Save details" }).click();
    await expect(page.locator(".rs-list li", { hasText: "Platform Test House" }).filter({ hasText: "Missing reference and guest name" })).toHaveCount(0);
    await page.goto("/admin/bookings?q=berg");
    await expect(page.locator(".rs-list li", { hasText: "4455998877" })).toContainText("Tomas Berg");
    await expect(page.locator(".rs-list li", { hasText: "4455998877" })).not.toContainText("Missing");
    if (process.env.GN_SHOTS) {
      await page.goto("/admin/bookings?when=upcoming");
      await page.screenshot({ path: `${process.env.GN_SHOTS}/computer-admin-upcoming.png`, fullPage: true });
    }
    await signOut(page);
  });
});

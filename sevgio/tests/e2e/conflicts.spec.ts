import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DB, iso, signIn, sql } from "./helpers.ts";

// Double bookings: a whole-house Airbnb reservation that overlaps a Sevgio booking for a room inside the house,
// a Booking.com reservation arriving the day the room guest leaves (fine until a turnover time is set), alerts, review and resolve.
const d = (n: number) => iso(n).replaceAll("-", "");
const ics = (events: [string, number, number, string, string?][]) => ["BEGIN:VCALENDAR", "VERSION:2.0",
  ...events.flatMap(([uid, from, to, summary, desc]) => ["BEGIN:VEVENT", `UID:${uid}`, `DTSTART;VALUE=DATE:${d(from)}`, `DTEND;VALUE=DATE:${d(to)}`, `SUMMARY:${summary}`, ...(desc ? [`DESCRIPTION:${desc}`] : []), "END:VEVENT"]),
  "END:VCALENDAR"].join("\r\n");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "conflict-feeds-"));
function sync(feed: string, text: string) {
  const file = path.join(dir, feed + ".ics");
  fs.writeFileSync(file, text);
  return JSON.parse(execFileSync("node", ["--experimental-strip-types", "--no-warnings", "tests/e2e/feed-sync.ts", feed, file], { env: { ...process.env, DATABASE_URL: DB } }).toString());
}
const U = 610; // far from other tests' dates
const shots = process.env.CF_SHOTS;
const card = (page: Page, text: string | RegExp) => page.locator("article.cf-card", { hasText: text });

const AIRBNB = [["cf-air-1@airbnb.com", U + 3, U + 6, "Reserved", "Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMCONF0001"]] as [string, number, number, string, string?][];
const BDC = [["cf-bdc-1@booking.com", U + 7, U + 9, "Reserved - Pat Lee", "Booking number: 4455667788"]] as [string, number, number, string, string?][];

test.describe.serial("double-booking detection and alerts", () => {
  const ids: Record<string, string> = {};

  test.beforeAll(async () => {
    const [h] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'dana@demo.sevgio.com'");
    const [g] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'guest@demo.sevgio.com'");
    [{ id: ids.house }] = await sql<{ id: string }>(
      "INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, status) VALUES ('cf-test-house', $1, 'Conflict Test House', 'Pittsburgh', 6, 20000, 'published') RETURNING id", [h.id]);
    [{ id: ids.room }] = await sql<{ id: string }>(
      "INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, status, parent_id) VALUES ('cf-test-room', $1, 'Garden Room', 'Pittsburgh', 2, 9000, 'published', $2) RETURNING id", [h.id, ids.house]);
    [{ id: ids.air }] = await sql<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url, last_synced_at) VALUES ($1, 'Airbnb', 'https://example.com/cf-air.ics', now()) RETURNING id", [ids.house]);
    [{ id: ids.bdc }] = await sql<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url, last_synced_at) VALUES ($1, 'Booking.com', 'https://example.com/cf-bdc.ics', now()) RETURNING id", [ids.room]);
    // A direct Sevgio booking for the room, made before Airbnb's calendar showed the whole-house reservation.
    [{ id: ids.booking }] = await sql<{ id: string }>(
      `INSERT INTO bookings (code, property_id, guest_id, check_in, check_out, guests, status, nights, nightly_price_cents, cleaning_fee_cents, tax_cents, total_cents, guest_name, guest_phone, adults, lodging_cents)
       VALUES ('SV-CNFL01', $1, $2, $3, $4, 1, 'confirmed', 3, 9000, 0, 0, 27000, 'Sarah Miller', '4125550100', 1, 27000) RETURNING id`, [ids.room, g.id, iso(U + 4), iso(U + 7)]);
    sync(ids.air, ics(AIRBNB));
    sync(ids.bdc, ics(BDC));
  });

  test.afterAll(async () => {
    await sql("DELETE FROM booking_conflicts WHERE property_ids && ARRAY(SELECT id FROM properties WHERE slug LIKE 'cf-test-%')");
    await sql("DELETE FROM bookings WHERE code = 'SV-CNFL01'");
    await sql("DELETE FROM blocks WHERE property_id IN (SELECT id FROM properties WHERE slug LIKE 'cf-test-%')");
    await sql("DELETE FROM channel_reservations WHERE property_id IN (SELECT id FROM properties WHERE slug LIKE 'cf-test-%')");
    await sql("DELETE FROM ical_feeds WHERE url LIKE 'https://example.com/cf-%'");
    await sql("DELETE FROM properties WHERE slug = 'cf-test-room'");
    await sql("DELETE FROM properties WHERE slug = 'cf-test-house'");
  });

  test("a whole-house Airbnb stay over a room booking is found, alerted and shown on the dashboard", async ({ page }) => {
    await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
    await page.goto("/host/conflicts");
    const c = card(page, "HMCONF0001");
    await expect(c).toHaveCount(1);
    await expect(c).toContainText("Double booked");
    await expect(c).toContainText("2 nights booked twice");
    await expect(c).toContainText("SV-CNFL01");
    await expect(c).toContainText("Sarah Miller");
    await expect(c).toContainText("Guest name unavailable"); // Airbnb's calendar doesn't give names
    // A normal same-day changeover (room guest leaves, Booking.com guest arrives) is not a conflict.
    await expect(card(page, "4455667788")).toHaveCount(0);
    if (shots) await page.screenshot({ path: `${shots}/computer-conflict-list.png`, fullPage: true });

    // The alert was sent once (email isn't set up in tests, so it says so) and logged.
    const [row] = await sql<{ notified_at: string | null; email_result: string; push_result: string }>(
      "SELECT notified_at, email_result, push_result FROM booking_conflicts WHERE property_ids && ARRAY[$1::uuid] AND kind = 'overlap'", [ids.room]);
    expect(row.notified_at).not.toBeNull();
    expect(row.email_result).toBe("Email is not set up on the server");
    expect(row.push_result).toBe("No devices have phone alerts on");
    expect((await sql("SELECT 1 FROM event_log WHERE area = 'Double bookings' AND message LIKE 'Double booking: %Conflict Test House%'")).length).toBeGreaterThan(0);

    // Every dashboard page carries the notice and a menu badge until it's resolved.
    await page.goto("/host");
    const banner = page.locator(".cf-banner");
    await expect(banner).toContainText("1 double booking needs your review");
    await expect(page.getByRole("navigation", { name: "Host menu" }).getByRole("link", { name: /Double bookings/ })).toContainText("1");
    if (shots) await page.screenshot({ path: `${shots}/computer-dashboard-banner.png` });
    await banner.getByRole("link", { name: "Review conflict" }).click();
    await expect(page).toHaveURL(/\/host\/conflicts$/);
  });

  test("Review conflict shows both reservations, the sync timing, and each opens", async ({ page }) => {
    await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
    await page.goto("/host/conflicts");
    await card(page, "HMCONF0001").getByRole("link", { name: "Review conflict" }).click();
    await expect(page.getByRole("heading", { level: 2 })).toContainText("Conflict Test House");
    const stays = page.locator(".cf-stay");
    await expect(stays).toHaveCount(2);
    await expect(stays.nth(0)).toContainText("Airbnb");
    await expect(stays.nth(0)).toContainText("Whole house");
    await expect(stays.nth(0)).toContainText("HMCONF0001");
    await expect(stays.nth(0)).toContainText("Last successful check of the Airbnb calendar");
    await expect(stays.nth(1)).toContainText("Sevgio (direct)");
    await expect(stays.nth(1)).toContainText("Garden Room");
    await expect(page.locator(".cf-strip .cf-clash")).toHaveCount(1);
    await expect(page.getByText("Email is not set up on the server")).toBeVisible();
    if (shots) await page.screenshot({ path: `${shots}/computer-review.png`, fullPage: true });
    const back = page.url();
    await page.getByRole("link", { name: "Open reservation 1" }).click();
    await expect(page).toHaveURL(/\/host\/bookings\/other-sites\//);
    await expect(page.getByText("HMCONF0001").first()).toBeVisible();
    await page.goto(back);
    await page.getByRole("link", { name: "Open reservation 2" }).click();
    await expect(page).toHaveURL(/\/trips\/SV-CNFL01/);
  });

  test("checking again never duplicates a conflict or re-sends its alert", async ({ page }) => {
    const before = await sql<{ id: string; notified_at: string }>("SELECT id, notified_at::text FROM booking_conflicts WHERE property_ids && ARRAY[$1::uuid]", [ids.room]);
    sync(ids.air, ics(AIRBNB));
    await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
    await page.goto("/host/conflicts");
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.getByText(/Checked\./)).toBeVisible();
    const after = await sql<{ id: string; notified_at: string }>("SELECT id, notified_at::text FROM booking_conflicts WHERE property_ids && ARRAY[$1::uuid]", [ids.room]);
    expect(after).toEqual(before);
  });

  test("a turnover time makes the same-day changeover a conflict; cancelling a stay clears it for review", async ({ page }) => {
    await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
    await page.goto("/host/conflicts");
    const form = page.locator(".cf-turn-form", { hasText: "Conflict Test House › Garden Room" });
    await form.getByRole("combobox").selectOption("6");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form).toContainText("Saved for Garden Room.");
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.getByText(/Checked\./)).toBeVisible();
    await page.reload();
    const t = card(page, "4455667788");
    await expect(t).toContainText("Turnover too short");
    await expect(t).toContainText("4 hours between check-out and check-in, but 6 hours are needed");
    await expect(t).toContainText("Pat Lee");

    // The room guest cancels: nothing overlaps any more, but both conflicts stay listed until someone reviews them.
    await sql("UPDATE bookings SET status = 'cancelled' WHERE code = 'SV-CNFL01'");
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.getByText(/Checked\./)).toBeVisible();
    await page.reload();
    await expect(t).toContainText("No longer overlapping");
    await expect(card(page, "HMCONF0001")).toContainText("No longer overlapping");
    await page.goto("/host");
    await expect(page.locator(".cf-banner")).toContainText("2 conflicts no longer overlap");
    await sql("UPDATE bookings SET status = 'confirmed' WHERE code = 'SV-CNFL01'");
  });

  test("resolving keeps both reservations and moves the conflict to Resolved", async ({ page }) => {
    await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
    await page.goto("/host/conflicts");
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(page.getByText(/Checked\./)).toBeVisible();
    await page.reload();
    await expect(card(page, "HMCONF0001")).toContainText("Double booked"); // reinstated, so live again
    await card(page, "HMCONF0001").getByRole("link", { name: "Review conflict" }).click();
    await page.getByLabel("Guest moved or rebooked elsewhere").check();
    await page.getByLabel("Note (optional)").fill("Moved Sarah to the Blue Room");
    await page.getByRole("button", { name: "Mark as resolved" }).click();
    await expect(page.getByRole("heading", { name: "Resolved", level: 3 })).toBeVisible();
    await expect(page.getByText("Guest moved or rebooked elsewhere: Moved Sarah to the Blue Room")).toBeVisible();
    await expect(page.getByText("Both reservations were left unchanged.")).toBeVisible();
    await expect(page.locator(".cf-review-head")).toContainText("Resolved");
    expect((await sql("SELECT 1 FROM bookings WHERE code = 'SV-CNFL01' AND status = 'confirmed'")).length).toBe(1);
    expect((await sql("SELECT 1 FROM channel_reservations WHERE external_ref = 'HMCONF0001' AND status = 'confirmed'")).length).toBe(1);
    await page.goto("/host/conflicts?tab=resolved");
    await expect(card(page, "HMCONF0001")).toContainText("Moved Sarah to the Blue Room");
    await page.goto("/host/conflicts");
    await expect(card(page, "HMCONF0001")).toHaveCount(0);
    await expect(card(page, "4455667788")).toContainText("Turnover too short");
  });

  test("admins see the same conflicts, and the review works on a phone", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/signin?next=/admin");
    await page.getByLabel("Email").fill("admin@demo.sevgio.com");
    await page.getByLabel("Password").fill("admin-password-2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator(".cf-banner")).toContainText("1 double booking needs your review");
    if (shots) await page.screenshot({ path: `${shots}/phone-dashboard-banner.png` });
    await page.goto("/admin/conflicts");
    await expect(card(page, "4455667788")).toBeVisible();
    await expect(page.getByText("Phone and computer alerts")).toBeVisible();
    if (shots) await page.screenshot({ path: `${shots}/phone-conflict-list.png`, fullPage: true });
    await card(page, "4455667788").getByRole("link", { name: "Review conflict" }).click();
    await expect(page.locator(".cf-stay")).toHaveCount(2);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    if (shots) await page.screenshot({ path: `${shots}/phone-review.png`, fullPage: true });
    await page.getByRole("link", { name: "Open reservation 2" }).click();
    await expect(page).toHaveURL(/\/host\/bookings\/other-sites\//);
    await ctx.close();
  });
});

import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DB, iso, signIn, signOut, sql } from "./helpers.ts";

const add = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
/** Runs the real calendar sync on an .ics text for one calendar link. */
function sync(feed: string, text: string) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gn-")), "feed.ics");
  fs.writeFileSync(file, text);
  execFileSync("node", ["--experimental-strip-types", "--no-warnings", "tests/e2e/feed-sync.ts", feed, file], { env: { ...process.env, DATABASE_URL: DB } });
}

// Reservations from Airbnb, Booking.com and Vrbo in the host's Upcoming and Past lists, with guest names (or a way to add them) and search.
test.describe.serial("guest names on reservations from other sites", () => {
  const UP = iso(300), PAST = iso(-40);
  let airFeed = "";

  test.beforeAll(async () => {
    const [h] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'dana@demo.sevgio.com'");
    const [{ id: house }] = await sql<{ id: string }>(
      "INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, status) VALUES ('gn-test-house', $1, 'Name Test House', 'Pittsburgh', 6, 20000, 'published') RETURNING id", [h.id]);
    const [{ id: room }] = await sql<{ id: string }>(
      "INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, status, parent_id) VALUES ('gn-test-room', $1, 'Blue Room', 'Pittsburgh', 2, 9000, 'published', $2) RETURNING id", [h.id, house]);
    const [air] = await sql<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Airbnb', 'https://example.com/gn-air.ics') RETURNING id", [room]);
    airFeed = air.id;
    // As a calendar sync stores them: Airbnb shares only the code, Vrbo sometimes the name; a past Booking.com stay entered from a payout file.
    await sql("INSERT INTO channel_reservations (property_id, feed_id, channel, kind, ical_uid, external_ref, check_in, check_out, summary) VALUES ($1, $2, 'airbnb', 'reservation', 'gn-a', 'HMGNTEST01', $3, $4, 'Reserved')",
      [room, air.id, UP, add(UP, 5)]);
    await sql("INSERT INTO channel_reservations (property_id, channel, kind, source, check_in, check_out, summary, guest_name, guest_name_source) VALUES ($1, 'vrbo', 'reservation', 'manual', $2, $3, 'Reserved - Lee Park', 'Lee Park', 'feed')",
      [house, add(UP, 20), add(UP, 23)]);
    await sql("INSERT INTO channel_reservations (property_id, channel, kind, source, external_ref, check_in, check_out, summary, guest_name, guest_name_source) VALUES ($1, 'bookingcom', 'reservation', 'import', '4455667788', $2, $3, 'Booking.com reservation', 'Oskar Nowak', 'import')",
      [house, PAST, add(PAST, 3)]);
    await sql("UPDATE channel_reservations SET received_payout_cents = 30000, expected_payout_cents = 30000 WHERE external_ref = '4455667788'");
    // And a direct Sevgio.com booking of the same house, which shares the list.
    const [g] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'guest@demo.sevgio.com'");
    await sql(`INSERT INTO bookings (code, property_id, guest_id, check_in, check_out, guests, adults, status, nights, nightly_price_cents, cleaning_fee_cents, tax_cents, total_cents, lodging_cents, guest_name, guest_phone)
               VALUES ('SV-GNTST1', $1, $2, $3, $4, 2, 2, 'confirmed', 3, 20000, 0, 0, 60000, 60000, 'Direct Gina Test', '412-555-0199')`, [house, g.id, add(UP, 10), add(UP, 13)]);
  });

  test.afterAll(async () => {
    await sql("DELETE FROM bookings WHERE code = 'SV-GNTST1'");
    await sql("DELETE FROM channel_reservations WHERE property_id IN (SELECT id FROM properties WHERE slug LIKE 'gn-test-%')");
    await sql("DELETE FROM ical_feeds WHERE url LIKE 'https://example.com/gn-%'");
    await sql("DELETE FROM properties WHERE slug = 'gn-test-room'");
    await sql("DELETE FROM properties WHERE slug = 'gn-test-house'");
  });

  test("Upcoming lists other-site reservations; a missing guest name can be added and is kept", async ({ page }) => {
    await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
    await page.goto("/host/bookings?view=upcoming");
    const air = page.locator("tr[data-platform=airbnb]", { hasText: "HMGNTEST01" });
    await expect(air).toContainText("Airbnb");
    await expect(air).toContainText("Name Test House › Blue Room");
    await expect(air).toContainText("Not provided by Airbnb");
    await expect(air).toContainText("Confirmed");
    const vrbo = page.locator("tr[data-platform=vrbo]", { hasText: "Lee Park" });
    await expect(vrbo).toContainText("From Vrbo");
    await expect(vrbo).toContainText("Reference not sent by Vrbo");
    await expect(vrbo).toContainText("Calendar details only");
    await expect(vrbo).toContainText("Vrbo's calendar link didn't send a reference.");
    await expect(air).toContainText("Payment unavailable");
    await expect(air).toContainText("Upcoming");
    await expect(air).not.toContainText("Paid on");
    // Sevgio's own bookings are still in the same list.
    await expect(page.locator("tr", { hasText: "SV-GNTST1" })).toContainText("Sevgio.com");
    // In date order: the Airbnb stay, then the Sevgio booking, then the Vrbo stay.
    const refs = await page.locator("tbody tr").allInnerTexts();
    const at = (s: string) => refs.findIndex(t => t.includes(s));
    expect(at("HMGNTEST01")).toBeLessThan(at("SV-GNTST1"));
    expect(at("SV-GNTST1")).toBeLessThan(at("Lee Park"));

    await expect(air).toContainText("Calendar details only");
    await expect(air).toContainText("Airbnb's calendar link never sends guest names.");
    await air.getByText("Add details").click();
    await air.getByLabel("Guest full name").fill("Maria  Lopez");
    await air.getByRole("button", { name: "Save details" }).click();
    await expect(air).toContainText("Saved.");
    await page.reload();
    await expect(page.locator("tr[data-platform=airbnb]", { hasText: "HMGNTEST01" })).toContainText("Maria Lopez");
    await expect(page.locator("tr[data-platform=airbnb]", { hasText: "HMGNTEST01" })).toContainText("Entered by hand");
    await expect(page.locator("tr[data-platform=airbnb]", { hasText: "HMGNTEST01" })).toContainText("Complete");
    // A missing reference can be typed in too.
    const lee = page.locator("tr[data-platform=vrbo]", { hasText: "Lee Park" });
    await lee.getByText("Add details").click();
    await lee.getByLabel("Vrbo reference").fill("ha-8xk2pq");
    await lee.getByRole("button", { name: "Save details" }).click();
    await expect(lee).toContainText("Saved.");
    await page.reload();
    await expect(page.locator("tr[data-platform=vrbo]", { hasText: "Lee Park" })).toContainText("HA-8XK2PQ");
    const [lr] = await sql<{ ref_source: string }>("SELECT ref_source FROM channel_reservations WHERE external_ref = 'HA-8XK2PQ'");
    expect(lr.ref_source).toBe("manual");
    // The next Airbnb calendar refresh keeps the typed name.
    sync(airFeed, ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:gn-a", `DTSTART;VALUE=DATE:${UP.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${add(UP, 5).replaceAll("-", "")}`, "SUMMARY:Reserved",
      "DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMGNTEST01\\nPhone Number (Last 4 Digits): 7788", "END:VEVENT", "END:VCALENDAR"].join("\r\n"));
    await page.reload();
    await expect(page.locator("tr[data-platform=airbnb]", { hasText: "HMGNTEST01" })).toContainText("Maria Lopez");
    await expect(page.locator("tr[data-platform=airbnb]", { hasText: "HMGNTEST01" })).toContainText("Phone ends in 7788");
    await expect(page.locator("tr[data-platform=airbnb]")).toHaveCount(1);
    const [r] = await sql<{ guest_name: string; guest_name_source: string; guest_name_by: string | null }>(
      "SELECT guest_name, guest_name_source, guest_name_by FROM channel_reservations WHERE external_ref = 'HMGNTEST01'");
    expect([r.guest_name, r.guest_name_source, !!r.guest_name_by]).toEqual(["Maria Lopez", "manual", true]);
    // The reservation's own page shows it too, with who entered it.
    await page.locator("tr[data-platform=airbnb]", { hasText: "HMGNTEST01" }).getByRole("link", { name: "HMGNTEST01" }).click();
    await expect(page.locator("dl")).toContainText("Maria Lopez");
    await expect(page.locator("dl")).toContainText(/Entered by .+ on /);
    await signOut(page);
  });

  test("Past lists finished stays; search finds reservations by guest name or booking reference", async ({ page }) => {
    await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
    await page.goto("/host/bookings?view=past");
    const bdc = page.locator("tr[data-platform=bookingcom]", { hasText: "4455667788" });
    await expect(bdc).toContainText("Oskar Nowak");
    await expect(bdc).toContainText("Booking.com");
    await expect(bdc).toContainText("Checked Out");
    await expect(bdc).toContainText("Payout received");
    await expect(bdc).toContainText("$300");
    await expect(bdc).toContainText("Complete");

    await page.getByRole("tab", { name: "Upcoming" }).click();
    await page.getByLabel("Guest name or booking reference").fill("lopez maria");
    await page.locator("form.bk-search").getByRole("button", { name: "Search" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("HMGNTEST01");
    await page.getByLabel("Guest name or booking reference").fill("gntest");
    await page.locator("form.bk-search").getByRole("button", { name: "Search" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    // The search carries over to other tabs.
    await page.getByLabel("Guest name or booking reference").fill("nowak");
    await page.locator("form.bk-search").getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("Nothing here yet.")).toBeVisible();
    await page.getByRole("tab", { name: "Past" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Oskar Nowak");
    await page.getByLabel("Guest name or booking reference").fill("44556677");
    await page.locator("form.bk-search").getByRole("button", { name: "Search" }).click();
    await expect(page.locator("tbody tr")).toContainText("Oskar Nowak");
    if (process.env.GN_SHOTS) {
      await page.goto("/host/bookings?view=upcoming");
      await page.screenshot({ path: `${process.env.GN_SHOTS}/computer-upcoming.png`, fullPage: true });
      await page.goto("/host/bookings?view=past");
      await page.screenshot({ path: `${process.env.GN_SHOTS}/computer-past.png`, fullPage: true });
      await page.goto("/host/bookings?view=upcoming&q=lopez");
      await page.screenshot({ path: `${process.env.GN_SHOTS}/computer-search.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/host/bookings?view=upcoming");
      await page.locator("tr[data-platform=vrbo]").getByText("Edit details").click();
      await page.screenshot({ path: `${process.env.GN_SHOTS}/phone-upcoming.png`, fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    await signOut(page);
  });

  test("only the listing's host and admins see these guests", async ({ page }) => {
    await signIn(page, "marcus@demo.sevgio.com", "demo-password-2026");
    for (const view of ["upcoming", "past"]) {
      await page.goto(`/host/bookings?view=${view}`);
      await expect(page.getByRole("tab", { name: "Upcoming" })).toBeVisible();
      await expect(page.getByText(/Maria Lopez|Oskar Nowak|Lee Park|HMGNTEST01/)).toHaveCount(0);
    }
    await page.goto("/host/bookings?view=upcoming&q=lopez");
    await expect(page.getByText("Maria Lopez")).toHaveCount(0);
    await signOut(page);

    await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
    await page.goto("/host/bookings?view=upcoming");
    await expect(page).toHaveURL(/no-access/);
    await signOut(page);

    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto("/admin/bookings?q=lopez");
    await expect(page.locator(".rs-row", { hasText: "HMGNTEST01" })).toContainText("Maria Lopez");
    await page.goto("/host/bookings?view=past&q=nowak");
    await expect(page.locator("tbody tr")).toContainText("Oskar Nowak");
    await signOut(page);
  });
});

import { test, expect } from "@playwright/test";
import { iso, signIn, signOut, sql } from "./helpers.ts";

// Every number on the dashboards, and every booking row, opens the details behind it.
test.describe.serial("clickable dashboards", () => {
  test.beforeAll(async () => {
    const [p] = await sql<{ id: string }>("SELECT id FROM properties WHERE slug = 'mount-washington-view-house'");
    const [g] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'guest@demo.sevgio.com'");
    await sql(`INSERT INTO bookings (code, property_id, guest_id, check_in, check_out, guests, adults, status, nights, nightly_price_cents, cleaning_fee_cents, tax_cents, total_cents, lodging_cents,
         guest_name, guest_phone, payment_method, card_fee_cents, due_now_cents, payment_status)
       VALUES ('SV-DASH01', $1, $2, $3, $4, 1, 1, 'confirmed', 1, 11000, 0, 0, 11000, 11000, 'Dash Guest', '555', 'cash', 0, 0, 'none')`, [p.id, g.id, iso(3), iso(4)]);
  });
  test.afterAll(async () => { await sql("DELETE FROM bookings WHERE code = 'SV-DASH01'"); });

  test("dashboard tiles and booking rows open their details", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    for (const [label, url] of [["Listings live", /\/host\/listings$/], ["Requests waiting for you", /view=requests/], ["Upcoming stays", /view=upcoming/], ["Upcoming booking value", /view=upcoming/], ["Unanswered questions", /\/host\/messages$/]] as const) {
      await page.goto("/host");
      await page.locator("a.stat-link", { hasText: label }).click();
      await expect(page).toHaveURL(url);
    }

    // Tapping anywhere on an arrival opens the reservation.
    await page.goto("/host");
    const row = page.locator("tr", { hasText: "SV-DASH01" });
    await row.getByText("Dash Guest").click();
    await expect(page).toHaveURL(/\/admin\/bookings\/SV-DASH01$/);

    // Admin dashboard tiles open what they count.
    for (const [label, url] of [["Guests", /role=customer/], ["Hosts", /role=host/], ["Listings live", /\/admin\/listings$/], ["Upcoming confirmed stays", /when=upcoming/], ["Requests awaiting hosts", /status=pending/], ["New contact messages", /\/admin\/messages$/]] as const) {
      await page.goto("/admin");
      await page.locator("a.stat-link", { hasText: new RegExp(`^\\S+${label}`) }).first().click();
      await expect(page).toHaveURL(url);
    }
    await signOut(page);
  });
});

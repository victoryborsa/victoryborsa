import { test, expect } from "@playwright/test";
import { iso, sql, signIn, signOut } from "./helpers.ts";

// Booking references on the confirmation, invoice and guest trips; the admin reservation search and record.
test.describe.configure({ mode: "serial" });

const KEEP = "Please keep your booking reference number and provide it when contacting us about your reservation.";
const CODES = { up: "SV-RSUP22", past: "SV-RSPA22", gone: "SV-RSCA22", twin: "SV-RSTW22" };

test.beforeAll(async () => {
  await sql("DELETE FROM bookings WHERE code LIKE 'SV-RS%'");
  const [guest] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'guest@demo.sevgio.com'");
  const props = await sql<{ id: string }>("SELECT id FROM properties WHERE status = 'published' AND parent_id IS NULL ORDER BY title LIMIT 2");
  const add = (code: string, prop: string, name: string, ci: number, co: number, status: string, paid: number) => sql(
    `INSERT INTO bookings (code, property_id, guest_id, check_in, check_out, guests, adults, status, nights, nightly_price_cents, cleaning_fee_cents, tax_cents, total_cents, lodging_cents,
       guest_name, guest_phone, payment_method, payment_status, paid_cents)
     VALUES ($1, $2, $3, $4, $5, 2, 2, $6, $7, 15000, 5000, 0, $8, $9, $10, '412-555-0199', 'zelle', $11, $12)`,
    [code, prop, guest.id, iso(ci), iso(co), status, co - ci, (co - ci) * 15000 + 5000, (co - ci) * 15000, name, paid ? "paid" : "pending", paid ? (co - ci) * 15000 + 5000 : 0]);
  await add(CODES.up, props[0].id, "Rosalind Search-Test", 200, 203, "confirmed", 1);
  await add(CODES.past, props[0].id, "Rosalind Search-Test", -40, -37, "confirmed", 1);
  await add(CODES.gone, props[1].id, "Rosalind Search-Test", 220, 222, "cancelled", 0);
  await add(CODES.twin, props[1].id, "Rosalind Other-Person", 230, 232, "awaiting_payment", 0);
});
test.afterAll(async () => { await sql("DELETE FROM bookings WHERE code LIKE 'SV-RS%'"); });

test("guest sees the booking reference, stay details, payment status and the keep-it message; the invoice uses the same reference", async ({ page }) => {
  await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
  await page.goto(`/trips/${CODES.up}`);
  await expect(page.getByTestId("booking-ref")).toHaveText(CODES.up);
  await expect(page.getByText(KEEP)).toBeVisible();
  const kv = page.locator("dl.kv").first();
  for (const t of ["Rosalind Search-Test", "Check-in", "Check-out", "2 adults", "$500", "Paid in full"]) await expect(kv).toContainText(t);

  await page.getByRole("link", { name: "View or print invoice" }).click();
  await expect(page.getByTestId("invoice-ref")).toHaveText(CODES.up);
  await expect(page.getByRole("article")).toContainText("Balance due");
  await expect(page.getByRole("article")).toContainText(KEEP);

  // A cancelled booking keeps its reference.
  await page.goto(`/trips/${CODES.gone}/invoice`);
  await expect(page.getByTestId("invoice-ref")).toHaveText(CODES.gone);
  await expect(page.getByText(/This booking is cancelled/)).toBeVisible();

  // My trips shows the reference on each card.
  await page.goto("/trips");
  await expect(page.locator(".trip-card", { hasText: CODES.up })).toContainText(`Ref ${CODES.up}`);
  // Guests can't open the admin record.
  await page.goto(`/admin/bookings/${CODES.up}`);
  await expect(page.getByTestId("booking-ref")).toHaveCount(0);
  await signOut(page);
});

test("admin finds reservations by partial name in any capitalization, tells same-name guests apart, and opens the full record", async ({ page }) => {
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin");
  // The search box is in the admin header on every page.
  await page.getByRole("searchbox", { name: "Booking reference or guest name" }).fill("rosalIND");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/bookings\?q=rosalIND/);
  const results = page.getByRole("list", { name: "Reservations found" });
  for (const c of Object.values(CODES)) await expect(results.locator(`a[data-ref="${c}"]`)).toBeVisible();
  // Upcoming before past before cancelled, each labeled.
  const order = await results.locator("a[data-ref]").evaluateAll(els => els.map(e => e.getAttribute("data-ref")));
  expect(order.indexOf(CODES.up)).toBeLessThan(order.indexOf(CODES.past));
  expect(order.indexOf(CODES.past)).toBeLessThan(order.indexOf(CODES.gone));
  await expect(results.locator(`a[data-ref="${CODES.past}"]`)).toContainText("Past");
  await expect(results.locator(`a[data-ref="${CODES.gone}"]`)).toContainText("Cancelled");
  await expect(results.locator(`a[data-ref="${CODES.twin}"]`)).toContainText("Waiting for payment");

  // Two words narrow it down; the time filter keeps the search.
  await page.getByRole("searchbox", { name: "Booking reference or guest name" }).fill("rosalind search");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(results.locator(`a[data-ref="${CODES.twin}"]`)).toHaveCount(0);
  await page.getByRole("link", { name: "Cancelled", exact: true }).click();
  await expect(page).toHaveURL(/when=cancelled/);
  await expect(results.locator("a[data-ref]")).toHaveCount(1);

  // By reference: lowercase, without the dash.
  await page.goto("/admin/bookings?q=" + encodeURIComponent(CODES.up.toLowerCase().replace("-", "")));
  await expect(results.locator("a[data-ref]").first()).toHaveAttribute("data-ref", CODES.up);
  await results.locator(`a[data-ref="${CODES.up}"]`).click();
  await expect(page.getByTestId("booking-ref")).toHaveText(CODES.up);
  for (const t of ["Rosalind Search-Test", "guest@demo.sevgio.com", "412-555-0199", "Upcoming", "Confirmed", "Paid in full"]) await expect(page.locator(".rd")).toContainText(t);
  await page.getByRole("link", { name: /Back to search results/ }).click();
  await expect(page).toHaveURL(/q=svrsup22/);

  await page.goto("/admin/bookings?q=nobody-by-this-name");
  await expect(page.getByText("No reservations found")).toBeVisible();
  await signOut(page);
});

test("on a phone, results are easy-to-tap cards and the record fits the screen", async ({ page }) => {
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/bookings?q=rosalind");
  const row = page.locator(`a[data-ref="${CODES.twin}"]`);
  await expect(row).toBeVisible();
  const box = (await row.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await row.click();
  await expect(page.getByTestId("booking-ref")).toHaveText(CODES.twin);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

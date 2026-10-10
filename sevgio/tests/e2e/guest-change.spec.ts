import { test, expect } from "@playwright/test";
import { iso, pickInPicker, signIn, signOut, sql } from "./helpers.ts";

test.describe.configure({ mode: "serial" });
// Far from other tests' dates; removed afterwards so later tests see no extra bookings.
test.afterAll(async () => { await sql("DELETE FROM bookings WHERE code LIKE 'SV-CHG%'"); });

async function mk(code: string, ci: number, co: number, paid = 0) {
  const [p] = await sql<{ id: string }>("SELECT id FROM properties WHERE slug = 'mount-washington-view-house'");
  const [g] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'guest@demo.sevgio.com'");
  const nights = co - ci;
  await sql(`INSERT INTO bookings (code, property_id, guest_id, check_in, check_out, guests, adults, status, nights, nightly_price_cents, cleaning_fee_cents, tax_cents, total_cents, lodging_cents,
       guest_name, guest_phone, payment_method, card_fee_cents, due_now_cents, payment_status, paid_cents)
     VALUES ($1, $2, $3, $4, $5, 1, 1, 'confirmed', $6, 11000, 0, 0, $7, $7, 'Josh Test', '555', 'cash', 0, 0, $8, $9)`,
    [code, p.id, g.id, iso(ci), iso(co), nights, nights * 11000, paid ? "paid" : "none", paid]);
}

test("a guest changes their own dates; the new nights are checked and repriced", async ({ page }) => {
  await mk("SV-CHG001", 500, 502);
  await mk("SV-CHG002", 510, 512); // someone else's nights later on
  await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
  await page.goto("/trips/SV-CHG001");
  await page.getByText("Change dates").click();
  await pickInPicker(page, /Check-in date/, [iso(503), iso(506)]);
  await page.getByRole("button", { name: "Save new dates" }).click();
  await expect(page.getByText("Your dates are changed.")).toBeVisible();
  const [b] = await sql<{ check_in: string; check_out: string; nights: number; total_cents: number }>("SELECT check_in::text, check_out::text, nights, total_cents FROM bookings WHERE code = 'SV-CHG001'");
  expect(b).toEqual({ check_in: iso(503), check_out: iso(506), nights: 3, total_cents: 33000 });

  // Nights another booking holds are refused.
  await page.getByText("Change dates").click();
  await pickInPicker(page, /Check-in date/, [iso(507), iso(509)]);
  await sql("UPDATE bookings SET check_in = $1, check_out = $2 WHERE code = 'SV-CHG002'", [iso(508), iso(512)]);
  await page.getByRole("button", { name: "Save new dates" }).click();
  await expect(page.getByText("Some of those nights are already booked.")).toBeVisible();
  await signOut(page);
});

test("a paid stay can't be shortened online; the guest is told to contact us", async ({ page }) => {
  await mk("SV-CHG003", 520, 523, 33000);
  await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
  await page.goto("/trips/SV-CHG003");
  await page.getByText("Change dates").click();
  await pickInPicker(page, /Check-in date/, [iso(520), iso(522)]);
  await page.getByRole("button", { name: "Save new dates" }).click();
  await expect(page.getByText(/To shorten a paid stay, please contact us/)).toBeVisible();
  const [b] = await sql<{ nights: number }>("SELECT nights FROM bookings WHERE code = 'SV-CHG003'");
  expect(b.nights).toBe(3);
  await signOut(page);
});

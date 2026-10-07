import { test, expect } from "@playwright/test";
import { iso, signIn, sql } from "./helpers.ts";

// Admin → Add Manual Reservation: a phone guest, confirmed with nothing paid, dates blocked, no double booking.
const CI = iso(720), CO = iso(723); // far from other tests' dates
const shots = process.env.MR_SHOTS; // folder for screenshots (optional)

test.describe.serial("manual reservation", () => {
  let home: { id: string; title: string };

  test.beforeAll(async () => {
    [home] = await sql<{ id: string; title: string }>("SELECT id, title FROM properties WHERE status = 'published' AND parent_id IS NULL ORDER BY title LIMIT 1");
  });

  test("admin adds a reservation for a guest who called; it's confirmed with $0 paid", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto("/admin/bookings");
    await page.getByRole("link", { name: "+ Add Manual Reservation" }).click();
    await expect(page).toHaveURL(/\/admin\/bookings\/new$/);
    await page.locator('form select[name="property"]').selectOption(home.id);
    await page.locator('form input[name="name"]').fill("Morgan Phonecall");
    await page.locator('form input[name="email"]').fill("morgan.phonecall@example.com");
    await page.locator('form input[name="phone"]').fill("412-555-0199");
    await page.locator('form input[name="check_in"]').fill(CI);
    await page.locator('form input[name="check_out"]').fill(CO);
    if (shots) await page.screenshot({ path: `${shots}/computer-form.png`, fullPage: true });
    await page.getByRole("button", { name: "Save Reservation" }).click();
    await expect(page).toHaveURL(/\/admin\/bookings\/SV-/);
    // Email isn't set up in the test site, so the page says the email couldn't go out (in production it says it was sent).
    await expect(page.getByRole("status").or(page.locator(".notice")).first()).toContainText("Reservation saved");
    await expect(page.getByText("Pay at the property", { exact: true })).toBeVisible();
    await expect(page.getByText(/Unpaid, \$[\d,.]+ due at the property/).first()).toBeVisible();
    await expect(page.getByText("Amount due", { exact: true })).toBeVisible();
    if (shots) {
      await page.screenshot({ path: `${shots}/computer-reservation.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${shots}/phone-reservation.png`, fullPage: true });
      await page.goto("/admin/bookings/new");
      await page.screenshot({ path: `${shots}/phone-form.png`, fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/admin/calendar?view=month&start=${CI.slice(0, 7)}-01`);
      await page.screenshot({ path: `${shots}/computer-calendar.png`, fullPage: true });
    }

    const [b] = await sql<{ status: string; payment_status: string; paid_cents: number; due_now_cents: number; total_cents: number; guest_phone: string; email: string }>(
      "SELECT b.status, b.payment_status, b.paid_cents, b.due_now_cents, b.total_cents, b.guest_phone, u.email FROM bookings b JOIN users u ON u.id = b.guest_id WHERE b.guest_name = 'Morgan Phonecall'");
    expect(b).toMatchObject({ status: "confirmed", payment_status: "none", paid_cents: 0, due_now_cents: 0, guest_phone: "412-555-0199", email: "morgan.phonecall@example.com" });
    expect(b.total_cents).toBeGreaterThan(0);
  });

  test("the same dates can't be booked twice, by hand or by a guest", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto("/admin/bookings/new");
    await page.locator('form select[name="property"]').selectOption(home.id);
    await page.locator('form input[name="name"]').fill("Second Caller");
    await page.locator('form input[name="email"]').fill("second.caller@example.com");
    await page.locator('form input[name="check_in"]').fill(iso(721));
    await page.locator('form input[name="check_out"]').fill(iso(725));
    await page.getByRole("button", { name: "Save Reservation" }).click();
    await expect(page.locator(".notice.error")).toContainText("already booked");
    expect(await sql("SELECT 1 FROM bookings WHERE guest_name = 'Second Caller'")).toHaveLength(0);
  });

  test("an unpaid manual reservation never expires on its own", async () => {
    // The hourly cleanup only expires unanswered requests and unpaid holds with a deadline.
    const [b] = await sql<{ payment_deadline: string | null }>("SELECT payment_deadline FROM bookings WHERE guest_name = 'Morgan Phonecall'");
    expect(b.payment_deadline).toBeNull();
  });

  test("dashboard and calendar have the button too", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    for (const path of ["/admin", "/admin/calendar"]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "+ Add Manual Reservation" })).toHaveAttribute("href", "/admin/bookings/new");
    }
  });
});

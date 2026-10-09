import { test, expect } from "@playwright/test";
import { iso, pickInPicker, signIn, signOut, sql } from "./helpers.ts";

// Admin → Add Manual Reservation → Corporate housing: a fixed negotiated price with a deposit, paid by card ($3 fee),
// Venmo or Cash App. Confirmed straight away, blocks the whole home and its rooms, goes out on the calendar link,
// and frees the dates again when cancelled.
const CI = iso(760), CO = iso(790);
const shots = process.env.CORP_SHOTS;

test.describe.serial("corporate housing reservation", () => {
  let home: { id: string; ical_token: string };
  let code = "";
  let saved: { key: string; value: unknown }[] = [];

  test.beforeAll(async () => {
    // A whole home that has rooms, so we can check the rooms are blocked too.
    [home] = await sql<{ id: string; ical_token: string; host_id: string }>(
      "SELECT id, ical_token, host_id FROM properties WHERE parent_id IS NULL AND status = 'published' ORDER BY title DESC LIMIT 1");
    await sql("INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, status, parent_id) VALUES ('corp-test-room', $1, 'Corner Room', 'Pittsburgh', 2, 9000, 'published', $2) ON CONFLICT (slug) DO NOTHING",
      [(home as unknown as { host_id: string }).host_id, home.id]);
    saved = await sql<{ key: string; value: unknown }>("SELECT key, value FROM settings WHERE key IN ('pay_card', 'venmo_handle', 'cashapp_handle')");
    await sql("INSERT INTO settings (key, value) VALUES ('pay_card', 'true'), ('venmo_handle', '\"@Sevgio-Stays\"'), ('cashapp_handle', '\"$SevgioStays\"') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");
  });

  // Leave the site as the other tests expect it: payment settings as they were, and no extra room or test booking.
  test.afterAll(async () => {
    await sql("DELETE FROM settings WHERE key IN ('pay_card', 'venmo_handle', 'cashapp_handle')");
    for (const r of saved) await sql("INSERT INTO settings (key, value) VALUES ($1, $2)", [r.key, JSON.stringify(r.value)]);
    await sql("DELETE FROM bookings WHERE guest_name = 'Corey Corporate'");
    await sql("DELETE FROM properties WHERE slug = 'corp-test-room'");
  });

  test("admin enters a $3,000 stay with a $500 deposit; it's confirmed and the guest is shown what to pay", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto("/admin/bookings/new");
    await page.locator('form select[name="property"]').selectOption(home.id);
    await page.locator('form input[name="name"]').fill("Corey Corporate");
    await page.locator('form input[name="email"]').fill("guest@demo.sevgio.com");
    await page.locator('form input[name="phone"]').fill("412-555-0142");
    await pickInPicker(page, /Check-in date/, [CI, CO]);
    await page.getByLabel(/Corporate housing: use a fixed negotiated price/).check();
    await page.getByLabel("Total price for the stay (USD)").fill("3000");
    await page.getByLabel("Deposit required (USD)").fill("500");
    await pickInPicker(page, /Remaining balance due by/, [iso(750)]);
    const summary = page.getByRole("table", { name: "Price summary" });
    await expect(summary).toContainText("Remaining balance$2,500");
    await expect(summary).toContainText("$3,003");
    if (shots) {
      await page.screenshot({ path: `${shots}/computer-form.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${shots}/phone-form.png`, fullPage: true });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await page.getByRole("button", { name: "Save Reservation" }).click();
    await expect(page).toHaveURL(/\/admin\/bookings\/SV-/);
    code = (await page.getByTestId("booking-ref").innerText()).trim();
    await expect(page.locator(".rd-pills")).toContainText("Confirmed");
    await expect(page.locator(".rd-pills")).toContainText("Unpaid");
    await expect(page.locator(".rd")).toContainText("Fixed corporate housing price");
    await expect(page.locator(".breakdown").first()).toContainText("Deposit due now$500");
    await expect(page.locator(".breakdown").first()).toContainText("Remaining balance");
    await expect(page.getByRole("button", { name: "Email invoice and payment request" })).toBeVisible();
    if (shots) await page.screenshot({ path: `${shots}/computer-reservation.png`, fullPage: true });

    const [b] = await sql<{ status: string; total_cents: number; deposit_due_cents: number; card_fee_flat_cents: number; tax_cents: number; cleaning_fee_cents: number }>(
      "SELECT status, total_cents, deposit_due_cents, card_fee_flat_cents, tax_cents, cleaning_fee_cents FROM bookings WHERE code = $1", [code]);
    expect(b).toMatchObject({ status: "confirmed", total_cents: 300000, deposit_due_cents: 50000, card_fee_flat_cents: 300, tax_cents: 0, cleaning_fee_cents: 0 });
  });

  test("the dates are blocked: on the calendar link, for the rooms, and for a second reservation", async ({ page, request }) => {
    const ics = await (await request.get(`/api/ical/${home.ical_token}.ics`, { headers: { "User-Agent": "Airbnb calendar importer" } })).text();
    expect(ics).toContain(`DTSTART;VALUE=DATE:${CI.replaceAll("-", "")}`);
    expect(ics).toContain(`DTEND;VALUE=DATE:${CO.replaceAll("-", "")}`);
    // A room in the house is blocked too, and its own calendar link says so.
    const [room] = await sql<{ id: string; ical_token: string }>("SELECT id, ical_token FROM properties WHERE parent_id = $1 LIMIT 1", [home.id]);
    expect(await (await request.get(`/api/ical/${room.ical_token}.ics`)).text()).toContain(`DTSTART;VALUE=DATE:${CI.replaceAll("-", "")}`);

    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto("/admin/bookings/new");
    await page.locator('form select[name="property"]').selectOption(room.id);
    await page.locator('form input[name="name"]').fill("Overlap Tester");
    await page.locator('form input[name="email"]').fill("overlap.tester@example.com");
    await page.evaluate(([a, z]) => {
      const set = (n: string, v: string) => { document.querySelector<HTMLInputElement>(`form input[name="${n}"]`)!.value = v; };
      set("check_in", a); set("check_out", z);
      document.querySelector<HTMLInputElement>("form .dp-req")!.value = "ok";
    }, [iso(765), iso(770)]);
    await page.getByRole("button", { name: "Save Reservation" }).click();
    await expect(page.locator(".notice.error")).toContainText("already booked or blocked");

    // The host's calendar page shows the site that read the link, and when.
    await page.goto(`/host/listings/${home.id}/calendar`);
    await expect(page.getByTestId("ical-fetches")).toContainText("Airbnb last checked it");
    await expect(page.getByTestId("ical-fetches")).toContainText("Not seen yet: Booking.com, Vrbo, Furnished Finder");
    if (shots) await page.getByTestId("ical-fetches").screenshot({ path: `${shots}/computer-link-checked.png` });
  });

  test("the guest sees the deposit and pays by card with a flat $3 fee, or by Venmo or Cash App", async ({ page }) => {
    await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
    await page.goto(`/trips/${code}`);
    const pay = page.getByTestId("pay-now");
    await expect(pay.getByTestId("deposit-due")).toContainText("Deposit due now: $500");
    await expect(pay.getByTestId("deposit-due")).toContainText("remaining $2,500 is due by");
    await expect(pay.getByRole("button", { name: "Pay deposit $503 by card" })).toBeVisible();
    await expect(pay.getByRole("button", { name: "Pay full balance $3,003 by card" })).toBeVisible();
    await expect(pay).toContainText("Venmo: send $500 (deposit) to @Sevgio-Stays");
    await expect(pay).toContainText("Cash App: send $500 (deposit) to $SevgioStays");
    await expect(page.getByTestId("change-dates")).toHaveCount(0); // corporate dates are changed by the admin
    await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
    await expect(page.locator(".nextsteps")).toContainText("Pay the $500 deposit now and the remaining $2,500 by");
    if (shots) {
      await page.screenshot({ path: `${shots}/computer-guest-pay.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${shots}/phone-guest-pay.png`, fullPage: true });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await signOut(page);
  });

  test("admin marks a Cash App deposit received, then extends the stay with a new total", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto(`/admin/bookings/${code}`);
    await page.getByText("Mark as paid", { exact: true }).click();
    const form = page.locator("details[open] form");
    await expect(form.getByLabel("Amount received")).toHaveValue("500.00");
    await form.getByLabel("Paid by").selectOption("cashapp");
    page.once("dialog", d => d.accept());
    await form.getByRole("button", { name: "Save payment" }).click();
    await expect(page.locator(".rd-pills")).toContainText("Deposit Paid");
    await expect(page.locator(".rd-pills")).toContainText("$2,500 due by");
    await expect(page.locator(".rd")).toContainText("Cash App");

    // Extend by a week: still editable after the deposit, re-checked, new agreed total.
    await page.getByText("Edit or extend reservation").click();
    await page.evaluate(v => { document.querySelector<HTMLInputElement>('form input[name="check_out"]')!.value = v; }, iso(797));
    await page.locator('input[name="total"]').fill("3700");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator(".rd-pills")).toContainText("$3,200 due");
    const [b] = await sql<{ check_out: string; total_cents: number; payment_status: string }>("SELECT check_out::text, total_cents, payment_status FROM bookings WHERE code = $1", [code]);
    expect(b).toMatchObject({ check_out: iso(797), total_cents: 370000, payment_status: "deposit_paid" });
    if (shots) await page.screenshot({ path: `${shots}/computer-deposit-paid.png`, fullPage: true });
  });

  test("cancelling reopens the dates and takes them off the calendar link", async ({ page, request }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto(`/admin/bookings/${code}`);
    await page.getByText("Cancel booking…").click();
    await page.locator('.rd-act form input[name="note"]').fill("Project ended early");
    page.once("dialog", d => d.accept());
    await page.getByRole("button", { name: "Cancel booking", exact: true }).click();
    await expect(page.locator(".rd-pills")).toContainText("Cancelled");
    const ics = await (await request.get(`/api/ical/${home.ical_token}.ics`)).text();
    expect(ics).not.toContain(`DTSTART;VALUE=DATE:${CI.replaceAll("-", "")}`);
  });
});

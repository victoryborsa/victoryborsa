import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { iso, signIn, signOut, sql } from "./helpers.ts";

test.describe.configure({ mode: "serial" });

test("access control: each role reaches only its own areas", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/signin\?next=%2Fadmin/);
  await page.goto("/host");
  await expect(page).toHaveURL(/\/signin/);

  await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
  await page.goto("/host");
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await signOut(page);

  await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
  const [marcusListing] = await sql<{ id: string }>("SELECT p.id FROM properties p JOIN users u ON u.id = p.host_id WHERE u.email = 'marcus@demo.sevgio.com' LIMIT 1");
  await page.goto(`/host/listings/${marcusListing.id}`);
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await page.goto("/host/listings");
  await expect(page.getByText("Lake Harmony Lodge")).toBeVisible();
  await expect(page.getByText("Rittenhouse Square Loft")).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await signOut(page);
});

test("host accepts a booking request", async ({ page }) => {
  await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
  await page.goto(`/book/lancaster-county-farmhouse-suite?ci=${iso(60)}&co=${iso(62)}&guests=2`);
  await page.getByLabel("Mobile phone").fill("(570) 555-0100");
  await page.getByLabel("Message to the host").fill("Hello, we'd love to stay for our anniversary.");
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Request sent to the host.")).toBeVisible();
  await signOut(page);

  await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
  await page.goto("/host");
  const row = page.locator("tr", { hasText: "anniversary" });
  await row.getByPlaceholder("Optional note to the guest").fill("Happy anniversary! Fresh flowers will be waiting.");
  await row.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Request accepted.", { exact: false })).toBeVisible();
  const [b] = await sql<{ status: string }>("SELECT status FROM bookings WHERE message LIKE '%anniversary%'");
  expect(b.status).toBe("confirmed");
  await signOut(page);
});

test("host edits price, blocks dates, uploads a photo, and imports nothing unsafe", async ({ page }) => {
  await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
  await page.goto("/host/listings");
  await page.locator("tr", { hasText: "Jim Thorpe" }).getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Nightly price (USD)").fill("172");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText("Saved. Changes are live on the site.")).toBeVisible();
  await page.goto("/stays/jim-thorpe-mountain-cabin");
  await expect(page.locator(".panel-price")).toContainText("$172");

  await page.goto("/host/listings");
  await page.locator("tr", { hasText: "Jim Thorpe" }).getByRole("link", { name: "Calendar" }).click();
  await page.getByLabel("First blocked night").fill(iso(80));
  await page.getByLabel("Open again from").fill(iso(83));
  await page.getByLabel("Note (only you see this)").fill("Chimney sweep");
  await page.getByRole("button", { name: "Block these dates" }).click();
  await expect(page.getByText(/Guests can't book those nights/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Chimney sweep")).toBeVisible();

  await page.getByLabel("Calendar link (.ics)").fill("https://127.0.0.1/cal.ics");
  await page.getByRole("button", { name: "Add and import" }).click();
  await expect(page.getByText(/first import failed: that address isn't allowed/)).toBeVisible();

  // iCal export works and includes the block
  const token = (await sql<{ ical_token: string }>("SELECT ical_token FROM properties WHERE slug = 'jim-thorpe-mountain-cabin'"))[0].ical_token;
  const ics = await (await page.request.get(`/api/ical/${token}`)).text();
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain(iso(80).replace(/-/g, ""));

  await page.goto("/host/listings");
  await page.locator("tr", { hasText: "Jim Thorpe" }).getByRole("link", { name: "Photos" }).click();
  await expect(page.locator(".photo-tile").first()).toBeVisible();
  const before = await page.locator(".photo-tile").count();
  const png = path.join(process.cwd(), "test-results", "upload.png");
  fs.mkdirSync(path.dirname(png), { recursive: true });
  const sharp = (await import("sharp")).default;
  await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#3a7" } }).png().toFile(png);
  await page.locator('input[type="file"]').setInputFiles(png);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("1 photo added.")).toBeVisible();
  await expect(page.locator(".photo-tile")).toHaveCount(before + 1);
  const newest = await page.locator(".photo-tile img").last().getAttribute("src");
  await page.locator(".photo-tile").last().getByRole("button", { name: "Make cover" }).click();
  await expect(page.locator(".photo-tile img").first()).toHaveAttribute("src", newest!);
  await signOut(page);
});

test("host creates a listing as a draft; it can't be published without photos", async ({ page }) => {
  await signIn(page, "marcus@demo.sevgio.com", "demo-password-2026");
  await page.goto("/host/listings/new");
  await page.getByLabel("Listing title").fill("Presque Isle Beach Cottage");
  await page.getByLabel("Town or city").fill("Erie");
  await page.getByLabel(/Area or region/).fill("Lake Erie");
  await page.getByLabel("Description").fill("A bright cottage two minutes from the Presque Isle beaches, with a screened porch and bikes for guests.");
  await page.getByLabel("Nightly price (USD)").fill("140");
  await page.getByRole("button", { name: "Save and add photos" }).click();
  await expect(page.getByText("Listing saved as a draft.")).toBeVisible();
  await page.getByRole("link", { name: "Details" }).click();
  await page.getByLabel("Visibility").selectOption("published");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText("Add at least one photo before publishing.")).toBeVisible();
  await page.goto("/stays?loc=Erie");
  await expect(page.getByRole("heading", { name: "No stays match your search" })).toBeVisible();
  await signOut(page);
});

test("admin manages roles, sees the activity log, and changes tax", async ({ page }) => {
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await expect(page).toHaveURL(/\/admin/);
  await page.goto("/admin/users?q=guest@demo");
  const row = page.locator("tr", { hasText: "guest@demo.sevgio.com" });
  await row.getByLabel(/Role for/).selectOption("host");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("guest@demo.sevgio.com is now a host.")).toBeVisible();
  await page.locator("tr", { hasText: "guest@demo.sevgio.com" }).getByLabel(/Role for/).selectOption("customer");
  await page.locator("tr", { hasText: "guest@demo.sevgio.com" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("guest@demo.sevgio.com is now a customer.")).toBeVisible();

  await page.goto("/admin/log");
  await expect(page.getByText(/Role for guest@demo.sevgio.com changed/).first()).toBeVisible();
  await expect(page.getByText("Could not import Airbnb").first()).toBeVisible();

  await page.goto("/admin/settings");
  await page.getByLabel(/Lodging tax/).fill("6");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/Settings saved/)).toBeVisible();
  await page.goto(`/stays/rittenhouse-square-loft?ci=${iso(90)}&co=${iso(92)}&guests=2`);
  await expect(page.locator("table.breakdown")).toContainText("Taxes (6%)");

  await page.goto("/admin/bookings");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.goto("/admin/messages");
  await expect(page.getByText("Can we bring two dogs?")).toBeVisible();
  await signOut(page);
});

test("scheduled job requires the secret", async ({ request }) => {
  expect((await request.get("/api/cron/sync-calendars")).status()).toBe(401);
  const ok = await request.get("/api/cron/sync-calendars", { headers: { authorization: "Bearer e2e-secret" } });
  expect(ok.status()).toBe(200);
});

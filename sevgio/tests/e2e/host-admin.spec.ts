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

test("host links a room to a whole home; each page points to the other", async ({ page }) => {
  await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
  await page.goto("/host/listings");
  await page.locator("tr", { hasText: "Lancaster County Farmhouse" }).getByRole("link", { name: "Edit" }).click();
  await page.getByLabel(/A private room/).check();
  await page.getByLabel("Which house is this room in?").selectOption({ label: "Lake Harmony Lodge" });
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText("Saved. Changes are live on the site.")).toBeVisible();
  await page.goto("/stays/lake-harmony-lodge");
  await expect(page.getByRole("heading", { name: "Just need a room?" })).toBeVisible();
  await page.goto("/stays/lancaster-county-farmhouse-suite");
  await expect(page.getByText(/This is a private room in/)).toBeVisible();
  // Marcus's listings aren't offered as homes to Dana.
  await page.goto("/host/listings/new");
  await page.getByLabel(/A private room/).check();
  await expect(page.getByLabel("Which house is this room in?").locator("option", { hasText: "Lake Harmony" })).toHaveCount(1);
  await expect(page.getByLabel("Which house is this room in?").locator("option", { hasText: "Rittenhouse" })).toHaveCount(0);
  await signOut(page);
});

test("host marks a bathroom as shared; guests see it and can filter it out", async ({ page }) => {
  await signIn(page, "marcus@demo.sevgio.com", "demo-password-2026");
  await page.goto("/host/listings");
  await page.locator("tr", { hasText: "Rittenhouse" }).getByRole("link", { name: "Edit" }).click();
  await page.getByRole("radio", { name: "Shared with other guests" }).check();
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText("Saved. Changes are live on the site.")).toBeVisible();
  await page.goto("/stays/rittenhouse-square-loft");
  await expect(page.locator(".facts")).toContainText("shared bathroom");
  await page.goto("/stays?loc=Philadelphia");
  await expect(page.locator("a.card")).toContainText("1 shared bath");
  await page.getByLabel("Private bathroom only").check();
  await expect(page).toHaveURL(/pbath=1/);
  await expect(page.getByRole("heading", { name: "No stays match your search" })).toBeVisible();
  await signOut(page);
});

test("listing details, per-guest pricing with children, and the owner statement", async ({ page }) => {
  // Admin sets a 20% management fee on Jim Thorpe Mountain Cabin.
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin/listings");
  await page.locator("tr", { hasText: "Jim Thorpe" }).getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Management fee (%)").fill("20");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText(/Saved\./)).toBeVisible();
  await signOut(page);

  // Host fills in details and per-guest pricing. The management fee isn't shown to hosts.
  await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
  await page.goto("/host/listings");
  await page.locator("tr", { hasText: "Jim Thorpe" }).getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Management fee (%)")).toHaveCount(0);
  await page.getByLabel("Maximum guests (including children)").fill("6");
  await page.getByLabel("Half bathrooms").fill("1");
  await page.getByLabel("Type (row 1)").selectOption("bed");
  await page.getByLabel("Mattress size (row 1)").selectOption("queen");
  await page.getByRole("button", { name: "+ Add another bed" }).click();
  await page.getByLabel("Type (row 2)").selectOption("sofa_bed");
  await page.getByLabel("Mattress size (row 2)").selectOption("full");
  await page.getByLabel("Stairs").fill("Bedrooms are upstairs, one flight of stairs.");
  await page.getByLabel("There are exterior security cameras").check();
  await page.getByLabel(/Where are they/).fill("Front door and driveway");
  await page.getByLabel(/Base occupancy/).fill("2");
  await page.getByLabel(/Extra guest fee/).fill("25");
  await page.getByLabel(/Children stay free up to age/).fill("5");
  await page.getByLabel(/Weekly discount/).fill("10");
  await page.getByLabel("Smoke alarm").check();
  await page.getByLabel("Keypad (door code)").check();
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText("Saved. Changes are live on the site.")).toBeVisible();
  await signOut(page);

  // Guest sees the details and the price changes with the group.
  await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
  await page.goto(`/stays/jim-thorpe-mountain-cabin?ci=${iso(150)}&co=${iso(157)}&adults=2`);
  await expect(page.getByRole("heading", { name: "Where you'll sleep" })).toBeVisible();
  await expect(page.getByText("1 Queen bed")).toBeVisible();
  await expect(page.getByText("1 sofa bed (Full)")).toBeVisible();
  await expect(page.getByText(/Exterior cameras: Front door and driveway/)).toBeVisible();
  await expect(page.getByText("Bedrooms are upstairs, one flight of stairs.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Home safety" })).toBeVisible();
  const panel = page.locator("#book");
  await expect(panel.locator("table.breakdown")).toContainText("Weekly discount (10%)");
  await panel.getByRole("button", { name: "More children" }).click();
  await expect(panel.locator("table.breakdown")).toContainText("Includes 1 extra guest");
  await panel.getByRole("button", { name: "More young children" }).click();
  await expect(panel.locator("table.breakdown")).toContainText("Includes 1 extra guest");
  await panel.getByRole("link", { name: "Reserve" }).click();
  await page.getByLabel("Mobile phone").fill("(570) 555-0100");
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: /Confirm booking/ }).click();
  await expect(page.getByText("You're booked!")).toBeVisible();
  await expect(page.getByText("2 adults, 1 child, 1 young child (free)")).toBeVisible();
  const code = (await page.locator(".code").textContent())!.trim();
  await signOut(page);

  // Nightly $172 (set in an earlier test) + $25 extra guest = $197 × 7 = $1,379, minus 10% ($137.90) = $1,241.10 rent. 20% fee = $248.22.
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto(`/admin/finance?month=${iso(150).slice(0, 7)}`);
  const row = page.locator("tr", { hasText: code });
  await expect(row).toContainText("$1,241.10");
  await expect(row).toContainText("$248.22");
  const csv = await (await page.request.get(`/api/finance/statement?month=${iso(150).slice(0, 7)}`)).text();
  expect(csv).toContain(code);
  expect(csv).toContain("1241.10");
  expect(csv).toContain("248.22");
  await signOut(page);

  // Hosts only see their own listings in finance.
  await signIn(page, "marcus@demo.sevgio.com", "demo-password-2026");
  await page.goto(`/host/finance?month=${iso(150).slice(0, 7)}`);
  await expect(page.locator("tr", { hasText: code })).toHaveCount(0);
  const marcusCsv = await (await page.request.get(`/api/finance/statement?month=${iso(150).slice(0, 7)}`)).text();
  expect(marcusCsv).not.toContain(code);
  await signOut(page);
  expect((await page.request.get(`/api/finance/statement`)).status()).toBe(401);
});

test("calendar board shows every property's reservations, filterable by property", async ({ page }) => {
  const [b] = await sql<{ code: string; guest_name: string; check_in: string }>(
    "SELECT b.code, b.guest_name, b.check_in::text FROM bookings b JOIN properties p ON p.id = b.property_id WHERE p.slug = 'lake-harmony-lodge' AND b.status = 'confirmed' ORDER BY b.check_in LIMIT 1");
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto(`/admin/calendar?start=${b.check_in}&days=14`);
  await expect(page.locator(".mc-name", { hasText: "Lake Harmony Lodge" })).toBeVisible();
  await expect(page.locator(".mc-name", { hasText: "Rittenhouse Square Loft" })).toBeVisible();
  await expect(page.locator(`a.mc-bar[href="/trips/${b.code}"]`)).toBeVisible();
  // Choosing one property shows just that home (and its rooms).
  await page.getByLabel("Property").selectOption({ label: "Rittenhouse Square Loft" });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.locator(".mc-name")).toHaveCount(1);
  await expect(page.locator(`a.mc-bar[href="/trips/${b.code}"]`)).toHaveCount(0);
  await signOut(page);
  // Hosts see only their own listings.
  await signIn(page, "marcus@demo.sevgio.com", "demo-password-2026");
  await page.goto(`/host/calendar?start=${b.check_in}&days=14`);
  await expect(page.locator(".mc-name", { hasText: "Lake Harmony Lodge" })).toHaveCount(0);
  await expect(page.locator(".mc-name", { hasText: "Rittenhouse Square Loft" })).toBeVisible();
  await signOut(page);
});

test("admin imports a house and its room from a file as drafts", async ({ page }) => {
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin/listings");
  await page.getByRole("link", { name: "Import from file" }).click();
  await page.getByLabel("Host for these listings").selectOption({ label: "Dana Brooks" });
  await page.getByLabel("Listing file").setInputFiles(path.join(process.cwd(), "tests/fixtures/import-sample.json"));
  await page.getByRole("button", { name: "Import as drafts" }).click();
  await expect(page.getByText(/Imported 2 listings as drafts: Import Test House, Import Test House – King Room/)).toBeVisible();
  await expect(page.getByText(/Broken Listing: Add the town or city/)).toBeVisible();
  const rows = await sql<{ title: string; status: string; parent: string | null; host: string; fee: number; amenities: string[]; half_bathrooms: number }>(
    `SELECT p.title, p.status, par.title AS parent, u.email AS host, p.management_fee_percent::float AS fee, p.amenities, p.half_bathrooms
     FROM properties p LEFT JOIN properties par ON par.id = p.parent_id JOIN users u ON u.id = p.host_id WHERE p.title LIKE 'Import Test House%' ORDER BY p.title`);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ status: "draft", parent: null, host: "dana@demo.sevgio.com", fee: 15, half_bathrooms: 1 });
  expect(rows[0].amenities).toContain("smoke_alarm");
  expect(rows[1]).toMatchObject({ status: "draft", parent: "Import Test House", host: "dana@demo.sevgio.com" });
  await signOut(page);
});

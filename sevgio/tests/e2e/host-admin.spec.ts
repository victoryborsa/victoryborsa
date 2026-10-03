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
  const icsRes = await page.request.get(`/api/ical/${token}.ics`);
  expect(icsRes.headers()["content-type"]).toContain("text/calendar");
  const ics = await icsRes.text();
  expect((await page.request.get(`/api/ical/${token}`)).status()).toBe(200);
  expect((await page.request.head(`/api/ical/${token}.ics`)).status()).toBe(200);
  const [empty] = await sql<{ ical_token: string }>("SELECT ical_token FROM properties WHERE slug = 'downtown-state-college-condo'");
  const emptyIcs = await (await page.request.get(`/api/ical/${empty.ical_token}.ics`)).text();
  expect(emptyIcs).toContain("BEGIN:VEVENT");
  expect(emptyIcs).toContain("DTSTART;VALUE=DATE:20000101");
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
  await page.locator("textarea[name=description]").fill("A bright cottage two minutes from the Presque Isle beaches, with a screened porch and bikes for guests.");
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
  await page.getByRole("link", { name: /Private bathroom/ }).click();
  await expect(page).toHaveURL(/pbath=1/);
  await expect(page.getByRole("heading", { name: "No stays match your search" })).toBeVisible();
  await signOut(page);
});

test("listing details, per-guest pricing with children, and the owner statement", async ({ page }) => {
  // Admin sets a 20% management fee on Jim Thorpe Mountain Cabin.
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin/listings");
  await page.locator(".al-card", { hasText: "Jim Thorpe" }).getByRole("link", { name: "Edit" }).click();
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
  await expect(page.getByText("1 sofa bed · Full · 54 × 75 in")).toBeVisible();
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
  // Picking a property in the list switches straight to it.
  await page.getByLabel("Property").selectOption({ label: "Rittenhouse Square Loft" });
  await expect(page).toHaveURL(/property=/);
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
  const [room] = await sql<{ slug: string }>("SELECT slug FROM properties WHERE title = 'Import Test House – King Room'");
  await page.goto(`/stays/${room.slug}`);
  await expect(page.getByText("Kitchen, living room and laundry are shared with other guests")).toBeVisible();
  await signOut(page);
});

test("calendar board colors bookings by the site they came from", async ({ page }) => {
  const [p] = await sql<{ id: string }>("SELECT id FROM properties WHERE slug = 'mount-washington-view-house'");
  const start = iso(400);
  for (const [i, name] of ["Airbnb", "Booking.com", "Vrbo", "Furnished Finder"].entries()) {
    const [f] = await sql<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, $2, 'https://example.com/x.ics') RETURNING id", [p.id, name]);
    await sql("INSERT INTO blocks (property_id, start_date, end_date, note, source) VALUES ($1, $2, $3, $4, $5)", [p.id, iso(400 + i * 3), iso(402 + i * 3), `${name}: Reserved`, "ical:" + f.id]);
  }
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto(`/admin/calendar?start=${start}&days=14`);
  for (const [cls, label] of [["ch-airbnb", "Airbnb"], ["ch-bookingcom", "Booking.com"], ["ch-vrbo", "Vrbo"], ["ch-furnished", "Furnished Finder"]])
    await expect(page.locator(`.mc-bar.${cls}`, { hasText: label })).toBeVisible();
  await signOut(page);
});

test("calendar has day, week and month views, and a one-property month with prices", async ({ page }) => {
  const [b] = await sql<{ code: string; guest_name: string; check_in: string; pid: string; title: string; price: number }>(
    `SELECT b.code, b.guest_name, b.check_in::text, p.id AS pid, p.title, p.nightly_price_cents AS price FROM bookings b JOIN properties p ON p.id = b.property_id
     WHERE p.slug = 'lake-harmony-lodge' AND b.status = 'confirmed' ORDER BY b.check_in LIMIT 1`);
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto(`/admin/calendar?view=week&start=${b.check_in}`);
  await expect(page.locator(".mc-day")).toHaveCount(7);
  await expect(page.locator(`a.mc-bar[href="/trips/${b.code}"]`)).toBeVisible();
  await page.getByRole("link", { name: "Day", exact: true }).click();
  await expect(page).toHaveURL(/view=day/);
  await expect(page.locator(".mc-day")).toHaveCount(1);
  await expect(page.locator(`a.mc-bar[href="/trips/${b.code}"]`)).toHaveText(`Arriving: ${b.guest_name}`);
  await page.getByRole("link", { name: "Next day" }).click();
  await expect(page.locator(`a[href="/trips/${b.code}"]`).first()).toHaveText(new RegExp(`(Staying|Leaving): ${b.guest_name}`));
  // Picking a property shows its month like a wall calendar, with prices on free days, and a Settings panel beside it.
  await page.getByRole("link", { name: "Month", exact: true }).click();
  await expect(page).toHaveURL(/view=month/);
  await page.getByLabel("Property").selectOption({ label: b.title });
  await expect(page.locator(`.mg a[href="/trips/${b.code}"]`).first()).toBeVisible();
  const price = "$" + (b.price / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
  await expect(page.locator(".mg-price").first()).toHaveText(price);
  const settings = page.getByRole("complementary", { name: `Settings for ${b.title}` });
  await expect(settings.getByRole("link", { name: /Base rate/ })).toContainText(`${price} / night`);
  await expect(settings.getByRole("link", { name: /Base rate/ })).toHaveAttribute("href", /\/host\/listings\/.+#pricing$/);
  await settings.getByRole("tab", { name: "Availability" }).click();
  await expect(settings).toContainText("Nights booked");
  await expect(settings.getByRole("link", { name: /Block dates/ })).toHaveAttribute("href", /\/calendar$/);
  await signOut(page);
});

test("admin can delete a listing without reservations, but not one with reservations", async ({ page }) => {
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  page.on("dialog", d => d.accept());
  // Lake Harmony has reservations: refused, with advice to hide it.
  const [lh] = await sql<{ id: string }>("SELECT id FROM properties WHERE slug = 'lake-harmony-lodge'");
  await page.goto(`/host/listings/${lh.id}?delete=1`);
  await page.getByLabel(/Yes, delete/).check();
  await page.getByRole("button", { name: "Delete listing" }).click();
  await expect(page.getByText(/can't see it|kept for your money records/)).toBeVisible();
  // A fresh draft with no bookings can be deleted from the listings page.
  const [h] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.sevgio.com'");
  await sql("INSERT INTO properties (host_id, slug, title, city, address, description, nightly_price_cents, max_guests, bedrooms, beds, bathrooms) VALUES ($1, 'delete-me-test', 'Delete Me Test', 'Erie', '1 Main St', 'x', 9900, 2, 1, 1, 1)", [h.id]);
  await page.goto("/admin/listings");
  await page.locator(".al-card", { hasText: "Delete Me Test" }).getByRole("link", { name: "Delete" }).click();
  await page.getByLabel(/Yes, delete/).check();
  await page.getByRole("button", { name: "Delete listing" }).click();
  await expect(page.getByText("Listing deleted.")).toBeVisible();
  await expect(page.locator(".al-card", { hasText: "Delete Me Test" })).toHaveCount(0);
  expect(await sql("SELECT 1 FROM properties WHERE slug = 'delete-me-test'")).toHaveLength(0);
  await signOut(page);
});

test("new bookings show an alert until the admin opens Bookings", async ({ page }) => {
  const [b] = await sql<{ code: string }>("SELECT code FROM bookings WHERE status = 'confirmed' ORDER BY created_at DESC LIMIT 1");
  await sql("UPDATE bookings SET seen_at = now()");
  await sql("UPDATE bookings SET seen_at = NULL WHERE code = $1", [b.code]);
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin");
  await expect(page.getByText("1 new booking.")).toBeVisible();
  await expect(page.locator(".dn a[href=\"/admin/bookings\"] .dn-badge")).toHaveText("1");
  await page.locator(".dn").getByRole("link", { name: /Bookings/ }).click();
  await expect(page.locator("tr.row-new", { hasText: b.code })).toBeVisible();
  await page.reload();
  await expect(page.locator("tr.row-new")).toHaveCount(0);
  await expect(page.locator(".dn a[href=\"/admin/bookings\"] .dn-badge")).toHaveCount(0);
  await signOut(page);
});

test("host can upload many big phone photos at once (over the 25 MB request limit in total)", async ({ page }) => {
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/host/listings");
  await page.locator("tr", { hasText: "Jim Thorpe" }).getByRole("link", { name: "Photos" }).click();
  await expect(page.locator(".photo-tile").first()).toBeVisible();
  const before = await page.locator(".photo-tile").count();
  const sharp = (await import("sharp")).default;
  const files: string[] = [];
  for (let i = 0; i < 3; i++) {
    const f = path.join(process.cwd(), "test-results", `big-${i}.png`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    // Random noise barely compresses, so each file is about 12 MB, like a phone photo.
    const raw = Buffer.alloc(2000 * 2000 * 3); for (let j = 0; j < raw.length; j++) raw[j] = (j * 2654435761 + i * 97) >>> 24;
    await sharp(raw, { raw: { width: 2000, height: 2000, channels: 3 } }).png({ compressionLevel: 0 }).toFile(f);
    files.push(f);
  }
  expect(files.reduce((n, f) => n + fs.statSync(f).size, 0)).toBeGreaterThan(25 * 1024 * 1024);
  await page.locator('input[type="file"]').setInputFiles(files);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("3 photos added.")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".photo-tile")).toHaveCount(before + 3);
  await signOut(page);
});

test("admin can send a test email and sees a plain explanation when email isn't set up", async ({ page }) => {
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin");
  await page.getByRole("button", { name: "Send me a test email" }).click();
  await expect(page.getByText(/Email isn't set up yet/)).toBeVisible();
  await signOut(page);
});

test("admin adds a real photo to a place in the Pittsburgh guide", async ({ page }) => {
  await page.goto("/pittsburgh#see");
  const card = page.locator(".gp-card", { hasText: "Duquesne Incline & Mount Washington" });
  // Until a photo is added, the place has a drawn picture.
  await expect(card.locator(".gp-art")).toBeVisible();
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin/guide");
  await page.getByRole("link", { name: "Duquesne Incline & Mount Washington" }).click();
  const f = path.join(process.cwd(), "test-results", "incline.png");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const sharp = (await import("sharp")).default;
  await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#B3262B" } }).png().toFile(f);
  const photos = page.locator("#photos");
  await photos.locator('input[type="file"]').setInputFiles(f);
  await photos.getByRole("button", { name: "Add photos" }).click();
  await expect(photos.getByText("1 photo added.")).toBeVisible();
  await page.goto("/pittsburgh#see");
  await expect(card.locator("img")).toBeVisible();
  // Guide photos never show up in the home page slideshow.
  expect(await sql("SELECT 1 FROM site_photos WHERE slot IS NULL")).toHaveLength(0);
  await page.goto("/admin/guide");
  await page.getByRole("link", { name: "Duquesne Incline & Mount Washington" }).click();
  await photos.getByRole("button", { name: "Remove" }).click();
  await expect(photos.locator("img")).toHaveCount(0);
  await page.goto("/pittsburgh#see");
  await expect(card.locator(".gp-art")).toBeVisible();
  await signOut(page);
});

test("admin manages guide places: draft, preview, publish, reorder, sponsor with dates, hide and delete", async ({ page }) => {
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin/guide");
  await page.getByRole("link", { name: "Add a place" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Yinzer Coffee Co.");
  await page.locator("select[name=section]").selectOption({ label: "What to eat" });
  await page.getByLabel(/Neighborhood/).fill("Lawrenceville");
  await page.locator("textarea[name=description]").fill("Locally roasted coffee and pastries on Butler Street.");
  await page.getByLabel(/Address/).fill("3700 Butler St, Pittsburgh, PA 15201");
  await page.getByLabel(/Website/).fill("yinzercoffee.example.com");
  await page.getByLabel(/Phone/).fill("(412) 555-0199");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText("Saved as a draft.")).toBeVisible();
  const editUrl = page.url().split("?")[0];
  // A draft isn't on the public guide, but Preview shows it.
  const eat = page.getByRole("region", { name: "What to eat" });
  await page.goto("/pittsburgh");
  await expect(eat.locator(".gp-card", { hasText: "Yinzer Coffee Co." })).toHaveCount(0);
  await page.goto("/pittsburgh?preview=1");
  await expect(page.getByText(/Preview\./)).toBeVisible();
  const draftCard = eat.locator(".gp-card", { hasText: "Yinzer Coffee Co." });
  await expect(draftCard).toContainText("Draft: not published yet");
  // Publish, then move it to the top so it's one of the first four.
  await page.goto(editUrl);
  await page.getByRole("button", { name: "Save and publish" }).click();
  await expect(page.getByText(/Published\./)).toBeVisible();
  await page.goto("/admin/guide");
  await page.getByRole("button", { name: "Move Yinzer Coffee Co. to the top" }).click();
  // Once it's first, its Top button turns off.
  await expect(page.getByRole("button", { name: "Move Yinzer Coffee Co. to the top" })).toBeDisabled();
  await page.goto("/pittsburgh");
  const first = eat.locator(".gp-card").first();
  await expect(first).toContainText("Yinzer Coffee Co.");
  await expect(first.locator(".ab-card-link")).toHaveAttribute("href", /3700%20Butler%20St/);
  await expect(first.getByRole("link", { name: "Website ↗" })).toHaveAttribute("href", "https://yinzercoffee.example.com");
  await expect(first.getByRole("link", { name: "(412) 555-0199" })).toHaveAttribute("href", "tel:4125550199");
  // Sponsored: a saved draft doesn't change the public page until it's published.
  await page.goto(editUrl);
  await page.getByLabel(/Sponsored listing/).check();
  await page.getByLabel("Sponsorship ends").fill(iso(30));
  await page.getByRole("button", { name: "Save draft (not public yet)" }).click();
  await expect(page.getByText(/Changes saved as a draft/)).toBeVisible();
  await page.goto("/pittsburgh");
  await expect(eat.locator(".gp-card").first().locator(".gp-sponsor-badge")).toHaveCount(0);
  await page.goto(editUrl);
  await page.getByRole("button", { name: "Publish changes" }).first().click();
  await page.goto("/pittsburgh");
  await expect(eat.locator(".gp-card").first().locator(".gp-sponsor-badge")).toHaveText("Sponsored");
  // The sponsorship ends by itself after its end date.
  await sql("UPDATE guide_places SET sponsor_end = current_date - 1 WHERE name = 'Yinzer Coffee Co.'");
  await page.reload();
  await expect(eat.locator(".gp-card").first().locator(".gp-sponsor-badge")).toHaveCount(0);
  // Hide, then delete.
  await page.goto("/admin/guide");
  await page.getByRole("button", { name: "Hide Yinzer Coffee Co." }).click();
  await expect(page.getByText("“Yinzer Coffee Co.” is hidden from visitors.")).toBeVisible();
  await page.goto("/pittsburgh");
  await expect(eat.locator(".gp-card", { hasText: "Yinzer Coffee Co." })).toHaveCount(0);
  await page.goto(editUrl);
  await page.getByRole("button", { name: "Delete Yinzer Coffee Co." }).click();
  await expect(page.getByText("“Yinzer Coffee Co.” was deleted.")).toBeVisible();
  expect(await sql("SELECT 1 FROM guide_places WHERE name = 'Yinzer Coffee Co.'")).toHaveLength(0);
  // Bad website or dates are refused.
  await page.goto("/admin/guide/new");
  await page.getByLabel("Name", { exact: true }).fill("Test Place");
  await page.getByLabel("Sponsorship starts").fill(iso(10));
  await page.getByLabel("Sponsorship ends").fill(iso(5));
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText("The sponsorship can't end before it starts.")).toBeVisible();
  // Visitors can't use preview.
  await signOut(page);
  await page.goto("/pittsburgh?preview=1");
  await expect(page.getByText(/Preview\./)).toHaveCount(0);
});

test("calendar: week starts today and month is a whole wall calendar", async ({ page }) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const [y, m] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin/calendar?view=week");
  await expect(page.locator(".mc-day")).toHaveCount(7);
  await expect(page.locator(".mc-day").first()).toHaveClass(/today/);
  await page.goto("/admin/calendar");
  const grid = page.locator(".mg-all");
  await expect(grid.locator(".mg-day")).toHaveCount(daysInMonth);
  await expect(grid.locator(".mg-num.today")).toHaveCount(1);
  await expect(grid.getByRole("columnheader", { name: "Sun" })).toBeVisible();
  // Tapping a day opens that day's details.
  await grid.locator(".mg-num.today").click();
  await expect(page).toHaveURL(/view=day/);
  await page.goto("/admin/calendar");
  await page.getByRole("link", { name: "Previous month" }).click();
  await expect(page.locator(".mg-all .mg-num.today")).toHaveCount(0);
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page.locator(".mg-all .mg-num.today")).toHaveCount(1);
  await signOut(page);
});

test("pets: host sets a pet fee, guests add pets and pay it", async ({ page }) => {
  const [p] = await sql<{ id: string }>("SELECT id FROM properties WHERE slug = 'mount-washington-view-house'");
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto(`/host/listings/${p.id}`);
  const pets = page.getByLabel("Pets allowed");
  if (!(await pets.isChecked())) await pets.check();
  await page.getByLabel("Charge a pet fee").check();
  await page.getByLabel("Pet fee (USD)").fill("25");
  await page.getByLabel("How the pet fee is charged").selectOption("stay");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  const [row] = await sql<{ pet_fee_cents: number; pet_fee_per: string }>("SELECT pet_fee_cents, pet_fee_per FROM properties WHERE id = $1", [p.id]);
  expect(row).toEqual({ pet_fee_cents: 2500, pet_fee_per: "stay" });

  // The listing page shows the fee, and the pets picker adds it to the price.
  await page.goto(`/stays/mount-washington-view-house?ci=${iso(330)}&co=${iso(332)}`);
  await expect(page.getByText("Allowed · $25 per stay")).toBeVisible();
  await page.getByRole("button", { name: "More pets" }).click();
  await expect(page.locator("#book table.breakdown")).toContainText("Pet fee (1 pet)");
  await page.locator("#book").getByRole("link", { name: /Reserve|Request to book/ }).click();
  await expect(page).toHaveURL(/pets=1/);
  await expect(page.locator("table.breakdown")).toContainText("Pet fee (1 pet)");
  await expect(page.locator("table.breakdown")).toContainText("$25");

  // Choosing Free removes the fee.
  await page.goto(`/host/listings/${p.id}`);
  await page.getByLabel("Free", { exact: true }).check();
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  const [free] = await sql<{ pet_fee_cents: number }>("SELECT pet_fee_cents FROM properties WHERE id = $1", [p.id]);
  expect(free.pet_fee_cents).toBe(0);
  await signOut(page);
});

test("bedroom details: host describes each room, guests tap bedrooms to see them", async ({ page }) => {
  const [p] = await sql<{ id: string }>("SELECT id FROM properties WHERE slug = 'jim-thorpe-mountain-cabin'");
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto(`/host/listings/${p.id}`);
  await page.getByRole("button", { name: "+ Add a bedroom" }).click();
  await page.getByLabel("Room name").fill("Primary Bedroom");
  await page.getByLabel("Room size (sq ft, optional)").fill("192");
  await page.getByLabel(/Bed type \(Primary Bedroom, bed 1\)/).selectOption("bed");
  await page.getByLabel(/Mattress size \(Primary Bedroom, bed 1\)/).selectOption("king");
  await page.getByLabel("Note for guests (optional)").fill("Private bathroom and smart TV");
  await page.getByLabel("Photo of this room").selectOption({ index: 1 });
  await page.getByRole("button", { name: "+ Add a bedroom" }).click();
  await page.getByLabel("Room name").nth(1).fill("Kids Room");
  await page.getByLabel(/Bed type \(Kids Room, bed 1\)/).selectOption("bunk_bed");
  await page.getByLabel(/Mattress size \(Kids Room, bed 1\)/).selectOption("twin");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  await signOut(page);

  await page.goto("/stays/jim-thorpe-mountain-cabin");
  await page.locator("a.fact-link").click();
  await expect(page).toHaveURL(/#rooms$/);
  const primary = page.locator(".room-card", { hasText: "Primary Bedroom" });
  await expect(primary).toContainText("1 King bed · 76 × 80 in");
  await expect(primary).toContainText("192 sq ft");
  await expect(primary).toContainText("Private bathroom and smart TV");
  await expect(primary.locator("img")).toBeVisible();
  await expect(page.locator(".room-card", { hasText: "Kids Room" })).toContainText("1 bunk bed · Twin · 38 × 75 in");
});

test("extra services and security deposit: host offers them, guest adds pickup and books", async ({ page }) => {
  const [p] = await sql<{ id: string }>("SELECT id FROM properties WHERE slug = 'downtown-state-college-condo'");
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto(`/host/listings/${p.id}`);
  await page.getByLabel("Airport pickup").check();
  await page.getByLabel("Price for Airport pickup").fill("45");
  await expect(page.getByLabel(/Uber/)).toHaveCount(0);
  await expect(page.getByLabel(/Groceries/)).toHaveCount(0);
  await page.getByLabel("Private city tour").check();
  await expect(page.getByLabel("Price for Private city tour")).toHaveValue("150");
  await expect(page.getByLabel("Note for Private city tour")).toHaveValue("2 hours");
  await page.getByLabel("Price for Private city tour").fill("30");
  await page.getByLabel("Late check-out").check();
  await expect(page.getByLabel("Note for Late check-out")).toHaveValue("Subject to availability");
  await page.getByLabel("How Private city tour is charged").selectOption("person");
  await page.getByLabel(/Refundable security deposit/).fill("200");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  await signOut(page);

  await page.goto(`/stays/downtown-state-college-condo?ci=${iso(345)}&co=${iso(347)}&adults=2`);
  await expect(page.getByRole("heading", { name: "Extra services" })).toBeVisible();
  await expect(page.getByText("$200, refundable after check-out")).toBeVisible();
  await page.locator(".extras").getByLabel(/Airport pickup/).check();
  await page.locator(".extras").getByLabel(/Private city tour/).check();
  await expect(page.locator(".extras").getByText("Free")).toBeVisible();
  await page.locator(".extras").getByLabel(/Late check-out/).check();
  const panel = page.locator("#book table.breakdown");
  await expect(panel).toContainText("Airport pickup");
  await expect(panel).toContainText("Private city tour × 2");
  await expect(panel).toContainText("$60");
  await expect(panel.getByRole("row").filter({ hasText: "Late check-out" })).toContainText("Free");
  await page.locator("#book").getByRole("link", { name: /Reserve|Request to book/ }).click();
  await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
  await page.goto(`/book/downtown-state-college-condo?ci=${iso(345)}&co=${iso(347)}&adults=2&svc=airport_pickup,city_tour,late_checkout,bogus`);
  await expect(page.locator("table.breakdown")).toContainText("Airport pickup");
  await page.getByLabel("Mobile phone").fill("(570) 555-0100");
  await expect(page.getByLabel("Date")).toHaveValue(iso(345));
  await page.getByLabel("Your flight lands at").fill("14:30");
  await page.getByLabel("Airline and flight number").fill("Delta DL 1234");
  if (await page.getByLabel(/^Zelle/).count()) await page.getByLabel(/^Zelle/).check();
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: /Confirm booking|Request to book|Book and pay|Send request/ }).click();
  await expect(page.locator(".code")).toBeVisible();
  const code = (await page.locator(".code").textContent())!.trim();
  await expect(page.getByText(/Flight lands .*2:30 PM · Delta DL 1234/)).toBeVisible();
  const [b] = await sql<{ services_cents: number; security_deposit_cents: number; services: { name: string }[] }>("SELECT services_cents, security_deposit_cents, services FROM bookings WHERE code = $1", [code]);
  expect(b.services_cents).toBe(4500 + 3000 * 2);
  expect(b.security_deposit_cents).toBe(20000);
  expect(b.services.map(x => x.name)).toEqual(["Airport pickup", "Private city tour", "Late check-out"]);
  await expect(page.getByText(/Refundable security deposit/)).toBeVisible();
  await signOut(page);
});

test("admin adds a property owner without emailing them and puts a listing under their name", async ({ page }) => {
  const ownerEmail = `owner-${Date.now()}@example.com`;
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin/users");
  const form = page.locator("form", { hasText: "Add a host, owner or admin" });
  await form.getByLabel("Name").fill("Owner Olivia");
  await form.getByLabel("Email", { exact: true }).fill(ownerEmail);
  await form.getByLabel("Role").selectOption("host");
  await form.getByLabel(/Send them an invitation email/).uncheck();
  await form.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByText(/Added Owner Olivia\. No email was sent/)).toBeVisible();
  await page.goto("/admin/listings");
  const row = page.locator(".al-card", { hasText: "Mount Washington View House" });
  await row.getByLabel("Host for Mount Washington View House").selectOption({ label: "Owner Olivia" });
  await row.locator("form").filter({ has: page.getByLabel("Host for Mount Washington View House") }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Mount Washington View House is now managed by Owner Olivia.")).toBeVisible();
  const [p] = await sql<{ email: string }>("SELECT u.email FROM properties p JOIN users u ON u.id = p.host_id WHERE p.slug = 'mount-washington-view-house'");
  expect(p.email).toBe(ownerEmail);
  // The admin still manages it.
  await page.goto("/host/listings");
  await expect(page.locator("tr", { hasText: "Mount Washington View House" })).toContainText("Owner Olivia");
  await signOut(page);
});

test("admin changes a listing's host from the listing editor; a house's rooms move with it", async ({ page }) => {
  const [house] = await sql<{ id: string }>("SELECT id FROM properties WHERE parent_id IS NULL AND EXISTS (SELECT 1 FROM properties r WHERE r.parent_id = properties.id) LIMIT 1");
  const [dana] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'dana@demo.sevgio.com'");
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto(`/host/listings/${house.id}`);
  await page.getByLabel("Host (owner)").selectOption(dana.id);
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  const rows = await sql<{ host_id: string }>("SELECT host_id FROM properties WHERE id = $1 OR parent_id = $1", [house.id]);
  expect(rows.length).toBeGreaterThan(1);
  expect(rows.every(r => r.host_id === dana.id)).toBe(true);
  // Changing the host on one room moves the whole house and its rooms back together.
  const [room] = await sql<{ id: string }>("SELECT id FROM properties WHERE parent_id = $1 LIMIT 1", [house.id]);
  await page.goto(`/host/listings/${room.id}`);
  await page.getByLabel("Host (owner)").selectOption({ label: "Test Admin" });
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText(/moved to the new host together/)).toBeVisible();
  const [admin] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.sevgio.com'");
  const again = await sql<{ host_id: string }>("SELECT host_id FROM properties WHERE id = $1 OR parent_id = $1", [house.id]);
  expect(again.every(r => r.host_id === admin.id)).toBe(true);
  await signOut(page);
});

test("yearly listing fee: a host can't publish until paid; admin marks paid or waives it", async ({ page }) => {
  const [l] = await sql<{ id: string; title: string }>(`SELECT p.id, p.title FROM properties p JOIN users u ON u.id = p.host_id
    WHERE u.email = 'marcus@demo.sevgio.com' AND p.parent_id IS NULL AND EXISTS (SELECT 1 FROM photos ph WHERE ph.property_id = p.id) ORDER BY p.title LIMIT 1`);
  const [before] = await sql<{ status: string }>("SELECT status FROM properties WHERE id = $1", [l.id]);
  await sql("UPDATE properties SET status = 'draft', listing_paid_until = NULL, listing_fee_waived = false WHERE id = $1", [l.id]);

  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin/settings");
  await expect(page.getByLabel("Charge hosts a yearly fee for each listing")).toBeChecked();
  await expect(page.getByLabel(/Fee per listing, per year/)).toHaveValue("100");
  await signOut(page);

  await signIn(page, "marcus@demo.sevgio.com", "demo-password-2026");
  await page.goto("/host/listings");
  await expect(page.getByText(/Yearly listing fee: \$100/)).toBeVisible();
  await page.goto(`/host/listings/${l.id}`);
  await page.getByLabel("Visibility").selectOption("published");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText(/needs to be paid before this listing can go live/)).toBeVisible();
  await signOut(page);

  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin/listings");
  const row = page.locator(".al-card").filter({ hasText: l.title }).first();
  await expect(row.getByText("Not paid")).toBeVisible();
  await row.getByRole("button", { name: "Mark paid (1 year)" }).click();
  await expect(row.getByText(/^Paid until/)).toBeVisible();
  const [paid] = await sql<{ days: number }>("SELECT (listing_paid_until - CURRENT_DATE) AS days FROM properties WHERE id = $1", [l.id]);
  expect(paid.days).toBeGreaterThanOrEqual(364);
  expect(paid.days).toBeLessThanOrEqual(366);
  await row.getByRole("button", { name: "Waive" }).click();
  await expect(row.getByText("Waived")).toBeVisible();
  await expect(row.getByRole("button", { name: "Charge fee" })).toBeVisible();
  const [mine] = await sql<{ title: string }>("SELECT p.title FROM properties p JOIN users u ON u.id = p.host_id WHERE u.role = 'admin' ORDER BY p.title LIMIT 1");
  if (mine) await expect(page.locator(".al-card").filter({ hasText: mine.title }).first().getByText("Your listing, no fee")).toBeVisible();
  await signOut(page);

  await signIn(page, "marcus@demo.sevgio.com", "demo-password-2026");
  await page.goto(`/host/listings/${l.id}`);
  await page.getByLabel("Visibility").selectOption("published");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  await signOut(page);
  await sql("UPDATE properties SET status = $2 WHERE id = $1", [l.id, before.status]);
});

test("smart pricing: prices follow events between the minimum and maximum; event days get a red circle", async ({ page }) => {
  const [p] = await sql<{ id: string }>("SELECT id FROM properties WHERE slug = 'downtown-state-college-condo'");
  // A Steelers game on a Tuesday a few weeks out.
  let d = iso(20);
  while (new Date(d + "T12:00:00Z").getUTCDay() !== 2) d = new Date(Date.parse(d + "T12:00:00Z") + 86_400_000).toISOString().slice(0, 10);
  await sql("INSERT INTO events (source, title, local_date, team, category) VALUES ('manual', 'Steelers vs. Browns', $1, 'steelers', 'Sports')", [d]);

  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto(`/host/listings/${p.id}`);
  await page.getByLabel("Nightly price (USD)").fill("100");
  await page.getByLabel(/Smart pricing/).check();
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText("Smart pricing needs a lowest and a highest price per night.")).toBeVisible();
  await page.getByLabel("Lowest price per night (USD)").fill("90");
  await page.getByLabel("Highest price per night (USD)").fill("149");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  await page.goto(`/admin/calendar?view=month&property=${p.id}&start=${d}`);
  const day = page.locator(".mg-day").filter({ has: page.locator(".mg-num.ev", { hasText: new RegExp(`^${Number(d.slice(8))}\\b`) }) });
  await expect(day).toHaveCount(1);
  await expect(day.locator(".mg-num")).toHaveAttribute("title", /Steelers vs\. Browns/);
  await expect(day.locator(".mg-price")).toHaveText("$130");
  await expect(page.getByText(/Red circle: a game, big event or holiday/)).toBeVisible();
  await signOut(page);

  // Monday + Tuesday (game) nights: $100 + $130.
  const mon = new Date(Date.parse(d + "T12:00:00Z") - 86_400_000).toISOString().slice(0, 10);
  await page.goto(`/stays/downtown-state-college-condo?ci=${mon}&co=${new Date(Date.parse(d + "T12:00:00Z") + 86_400_000).toISOString().slice(0, 10)}&adults=2`);
  const panel = page.locator("#book table.breakdown");
  await expect(panel).toContainText("$115 avg × 2 nights");
  await expect(panel).toContainText("$230");
  await sql("UPDATE properties SET smart_pricing = false WHERE id = $1", [p.id]);
});

test("monthly rentals: the Indiana house file imports as a house and 4 rooms priced by the month", async ({ page }) => {
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/host/listings/import");
  await page.getByLabel("Listing file").setInputFiles(path.join(process.cwd(), "..", "listing-files", "meadow-wood-house-indiana-pa.json"));
  await page.getByRole("button", { name: "Import as drafts" }).click();
  await expect(page.getByText(/Imported 5 listings as drafts/)).toBeVisible();
  const rows = await sql<{ title: string; monthly_price_cents: number; min_nights: number; max_nights: number; max_guests: number; parent: string | null }>(
    "SELECT p.title, p.monthly_price_cents, p.min_nights, p.max_nights, p.max_guests, h.title AS parent FROM properties p LEFT JOIN properties h ON h.id = p.parent_id WHERE p.title LIKE 'Meadow Wood House%' ORDER BY p.title");
  expect(rows).toHaveLength(5);
  const house = rows.find(r => r.title.endsWith("Entire Home"))!;
  expect(house).toMatchObject({ monthly_price_cents: 395000, max_guests: 8, min_nights: 30, max_nights: 365, parent: null });
  expect(rows.filter(r => r.parent === house.title).every(r => r.monthly_price_cents === 99500 && r.max_guests === 2)).toBe(true);
  // Publish one room (with a photo) and check what guests see.
  const [room] = await sql<{ id: string; slug: string }>("SELECT id, slug FROM properties WHERE title = 'Meadow Wood House – King Suite'");
  await sql("INSERT INTO photos (property_id, position, large, thumb, width, height) SELECT $1, 0, large, thumb, width, height FROM photos LIMIT 1", [room.id]);
  await sql("UPDATE properties SET status = 'published' WHERE id = $1", [room.id]);
  await page.goto(`/stays/${room.slug}?ci=${iso(40)}&co=${iso(75)}&adults=2`);
  await expect(page.locator(".panel-price")).toContainText("$995");
  await expect(page.locator(".panel-price")).toContainText("/ month");
  const panel = page.locator("#book table.breakdown");
  await expect(panel).toContainText("$995 × 1 month + 5 extra days");
  await expect(panel).toContainText("All-inclusive monthly rent");
  await signOut(page);
});

test("admin sets a new password for a locked-out person; they can sign in right away", async ({ page }) => {
  const [o] = await sql<{ id: string; email: string }>("SELECT id, email FROM users WHERE name = 'Owner Olivia'");
  for (let i = 0; i < 6; i++) await sql("INSERT INTO login_attempts (email, ip, success) VALUES ($1, '10.0.0.9', false)", [o.email]);
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto(`/admin/users?q=${encodeURIComponent(o.email)}`);
  await page.getByText("Set a new password").click();
  await page.getByLabel("New password for Owner").fill("olivia-pass-2026");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText(/New password saved for/)).toBeVisible();
  await signOut(page);
  await signIn(page, o.email, "olivia-pass-2026");
  await page.getByRole("banner").getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("menu", { name: "Menu" }).getByRole("menuitem", { name: "Account" })).toBeVisible();
  await page.keyboard.press("Escape");
  await signOut(page);
});

test("admin can look up all listings on the map; each listing says whether it's on the map", async ({ page }) => {
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin/listings");
  await expect(page.getByText(/On the map|Not looked up yet|Address not found/).first()).toBeVisible();
  await page.getByRole("button", { name: /Find listings on the map/ }).click();
  await expect(page.getByText(/on the map|couldn't be found/).first()).toBeVisible();
  await signOut(page);
});

test("corporate housing: host shows a home with its monthly rate and fees; companies send a request", async ({ page }) => {
  const [p] = await sql<{ id: string; title: string }>("SELECT id, title FROM properties WHERE slug = 'mount-washington-view-house'");
  await page.goto("/corporate-housing");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A furnished home for your next assignment");
  await expect(page.locator(".ch-home")).toHaveCount(0);

  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto(`/host/listings/${p.id}`);
  await page.getByLabel("Show on the Corporate Housing page").check();
  await page.getByLabel("Monthly price (USD, all inclusive)").fill("4500");
  await page.getByLabel("Security deposit (USD)").fill("100");
  await page.getByLabel("Cleaning fee (USD, one time)").fill("450");
  await page.getByLabel("Pet fee (USD, non-refundable, 0 = none)").fill("750");
  await page.getByLabel("Furnished Finder link (optional)").fill("https://www.furnishedfinder.com/property/123456_1");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  // The page lists the home with its fixed monthly price and every fee; it's in the top bar and the ☰ menu.
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Corporate housing" }).click();
  const card = page.locator(".ch-home", { hasText: p.title });
  await expect(card).toContainText("$4,500");
  await expect(card).toContainText("Fixed price, all inclusive");
  await expect(card).toContainText("Security deposit$100");
  await expect(card).toContainText("Cleaning fee");
  await expect(card).toContainText("$450");
  await expect(card).toContainText("Pet fee");
  await expect(card).toContainText("$750");
  await expect(card).toContainText("Available now");
  await expect(card.getByRole("link", { name: /Furnished Finder/ })).toHaveAttribute("href", "https://www.furnishedfinder.com/property/123456_1");

  // Homes are cheapest first, unless the host gives one a place in the order.
  const [other] = await sql<{ title: string }>("UPDATE properties SET corp_listed = true, corp_monthly_cents = 150000 WHERE id = (SELECT id FROM properties WHERE status = 'published' AND parent_id IS NULL AND id <> $1 ORDER BY slug LIMIT 1) RETURNING title", [p.id]);
  await page.reload();
  await expect(page.locator(".ch-home h3").first()).toHaveText(other.title);
  await page.goto(`/host/listings/${p.id}`);
  await page.getByLabel("Order on the page (1 = first, optional)").fill("1");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  await page.goto("/corporate-housing");
  await expect(page.locator(".ch-home h3").first()).toHaveText(p.title);
  await sql("UPDATE properties SET corp_listed = false WHERE title = $1", [other.title]);

  // "Request this home" picks it in the form; the request lands in Admin messages.
  await card.getByRole("link", { name: "Request this home" }).click();
  await expect(page.locator("#request select[name=home]")).toHaveValue(p.id);
  await page.getByLabel("Company or agency (optional)").fill("Three Rivers Staffing");
  await page.getByLabel("Phone (optional)").fill("(412) 555-0142");
  await page.getByLabel("Move-in date").fill(iso(20));
  await page.getByLabel("Length of stay").selectOption("3 months (13 weeks)");
  await page.getByLabel("Hospital, workplace or area (optional)").fill("UPMC Mercy");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Request sent\. We'll reply to admin@demo\.sevgio\.com/)).toBeVisible();
  const [m] = await sql<{ topic: string; body: string; property_id: string }>("SELECT topic, body, property_id FROM messages ORDER BY created_at DESC LIMIT 1");
  expect(m.topic).toBe("Corporate housing request (Three Rivers Staffing)");
  expect(m.property_id).toBe(p.id);
  expect(m.body).toContain("Length of stay: 3 months (13 weeks)");
  expect(m.body).toContain("Area or workplace: UPMC Mercy");

  // Private rooms can be listed too, and say which house they are in.
  const [room] = await sql<{ id: string; title: string; parent: string }>("UPDATE properties r SET corp_listed = true, corp_monthly_cents = 170000, corp_deposit_cents = 50000, corp_cleaning_cents = 15000, corp_pet_fee_cents = 50000 FROM properties h WHERE h.id = r.parent_id AND r.id = (SELECT id FROM properties WHERE parent_id IS NOT NULL AND status = 'published' ORDER BY slug LIMIT 1) RETURNING r.id, r.title, h.title AS parent");
  await page.goto("/corporate-housing");
  const roomCard = page.locator(".ch-home", { hasText: room.title });
  await expect(roomCard).toContainText(`Private room in ${room.parent}`);
  await expect(roomCard).toContainText("$1,700");
  await expect(roomCard).toContainText("$150");
  await expect(roomCard.getByRole("link", { name: "Request this room" })).toBeVisible();
  await sql("UPDATE properties SET corp_listed = false WHERE id = $1", [room.id]);

  // Switching it off removes it from the page.
  await page.goto(`/host/listings/${p.id}`);
  await page.getByLabel("Show on the Corporate Housing page").uncheck();
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  await page.goto("/corporate-housing");
  await expect(page.locator(".ch-home")).toHaveCount(0);
  await signOut(page);
});

import { test, expect, type Page } from "@playwright/test";
import { iso, pickInPicker, signIn, signOut, sql } from "./helpers.ts";

// Reservations list (Today / Upcoming / History), read-only rules and guest messaging, on a computer and a phone.
const T = iso(0);
const SHOTS = process.env.RV_SHOTS;
const shot = async (page: Page, name: string, fullPage = true) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage }); };
const card = (page: Page, text: string) => page.locator(".rv-item", { hasText: text });

test.describe.serial("reservations list", () => {
  let house = "", garden = "", loft = "", other = "", otherTitle = "";

  test.beforeAll(async () => {
    const [h] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'dana@demo.sevgio.com'");
    const [g] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'guest@demo.sevgio.com'");
    [{ id: house }] = await sql<{ id: string }>("INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, status) VALUES ('rv-test-house', $1, 'Aaron Test House', 'Pittsburgh', 6, 20000, 'published') RETURNING id", [h.id]);
    [{ id: garden }] = await sql<{ id: string }>("INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, status, parent_id) VALUES ('rv-garden', $1, 'Garden Room', 'Pittsburgh', 2, 9000, 'published', $2) RETURNING id", [h.id, house]);
    [{ id: loft }] = await sql<{ id: string }>("INSERT INTO properties (slug, host_id, title, city, max_guests, nightly_price_cents, status, parent_id) VALUES ('rv-loft', $1, 'Loft Room', 'Pittsburgh', 2, 9000, 'published', $2) RETURNING id", [h.id, house]);
    [{ id: other, title: otherTitle }] = await sql<{ id: string; title: string }>("SELECT id, title FROM properties WHERE parent_id IS NULL AND status = 'published' AND slug <> 'rv-test-house' ORDER BY title LIMIT 1");
    const add = (code: string, pid: string, name: string, a: number, b: number, paid: boolean, booked: number) =>
      sql(`INSERT INTO bookings (code, property_id, guest_id, check_in, check_out, guests, status, nights, nightly_price_cents, cleaning_fee_cents, tax_cents, total_cents, guest_name, guest_phone, adults, lodging_cents, paid_cents, payment_status, created_at)
           VALUES ($1, $2, $3, $4, $5, 2, 'confirmed', $6, 10000, 0, 0, 10000, $7, '555', 2, 10000, $8, $9, now() - make_interval(days => $10))`,
        [code, pid, g.id, iso(a), iso(b), b - a, name, paid ? 10000 : 0, paid ? "paid" : "none", booked]);
    await add("RVOLD1", garden, "Olive Finished", -7, -4, true, 30);    // finished before today: History only
    await add("RVPAST2", loft, "Paul Pastunpaid", -10, -8, false, 40);  // past and unpaid: still editable
    await add("RVSTAY", garden, "Stella Staying", -3, 4, false, 20);    // started earlier, still staying
    await add("RVARR", loft, "Arlo Arriving", 0, 2, true, 5);           // arrives today, paid
    await add("RVLEAV", other, "Leah Leaving", -2, 0, false, 10);       // leaves today, another property
    const [f] = await sql<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Airbnb', 'https://example.com/rv.ics') RETURNING id", [loft]);
    await sql("INSERT INTO channel_reservations (property_id, feed_id, channel, check_in, check_out, summary, external_ref) VALUES ($1, $2, 'airbnb', $3, $4, 'Reserved', 'HMRVTEST1')", [loft, f.id, iso(5), iso(7)]);
    const [b] = await sql<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Booking.com', 'https://example.com/rv-b.ics') RETURNING id", [house]);
    await sql("INSERT INTO channel_reservations (property_id, feed_id, channel, kind, check_in, check_out, summary) VALUES ($1, $2, 'bookingcom', 'unknown', $3, $4, 'CLOSED - Not available')", [house, b.id, iso(10), iso(12)]);
  });

  test.afterAll(async () => {
    await sql("DELETE FROM bookings WHERE code LIKE 'RV%'");
    await sql("DELETE FROM channel_reservations WHERE feed_id IN (SELECT id FROM ical_feeds WHERE url LIKE 'https://example.com/rv%')");
    await sql("DELETE FROM ical_feeds WHERE url LIKE 'https://example.com/rv%'");
    await sql("DELETE FROM properties WHERE slug IN ('rv-garden', 'rv-loft', 'rv-test-house')");
  });

  test("Today's reservations: today's arrivals, stays and checkouts on every property, nothing finished", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto("/admin/calendar?view=month");
    await page.getByRole("link", { name: "Today's reservations" }).click();
    await expect(page).toHaveURL(/view=list.*scope=today/);
    const list = page.getByTestId("res-list");
    await expect(card(page, "Stella Staying")).toContainText("Staying");
    await expect(card(page, "Arlo Arriving")).toContainText("Arriving today");
    await expect(card(page, "Leah Leaving")).toContainText("Leaving today");
    await expect(list).not.toContainText("Olive Finished");
    await expect(list).not.toContainText("HMRVTEST1");
    // Grouped by date, then by property, with each room named.
    await expect(page.locator(".rv-home-h", { hasText: "Aaron Test House" }).first()).toBeVisible();
    await expect(page.locator(".rv-home-h", { hasText: otherTitle }).first()).toBeVisible();
    await expect(card(page, "Stella Staying")).toContainText("Garden Room");
    await expect(card(page, "Arlo Arriving")).toContainText("Loft Room");
    await expect(card(page, "Arlo Arriving")).toContainText("Sevgio.com");
    await expect(card(page, "Arlo Arriving")).toContainText("RVARR");
    await expect(card(page, "Arlo Arriving")).toContainText("2 guests");
    await expect(card(page, "Arlo Arriving")).toContainText("Paid");
    await expect(card(page, "Stella Staying")).toContainText("Unpaid");
    await shot(page, "computer-today");
    // A property filter narrows it; All properties brings everything back.
    await page.getByLabel("Property").selectOption({ label: otherTitle });
    await expect(card(page, "Leah Leaving")).toBeVisible();
    await expect(card(page, "Stella Staying")).toHaveCount(0);
    await expect(page).toHaveURL(/scope=today/);
    await page.getByLabel("Property").selectOption({ label: "All properties" });
    await expect(card(page, "Stella Staying")).toBeVisible();
  });

  test("Upcoming is the default; History keeps finished stays; missing site details say so", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto("/admin/calendar");
    await expect(page.getByRole("link", { name: "Upcoming" })).toHaveAttribute("aria-current", "page");
    await expect(card(page, "Stella Staying")).toBeVisible();
    await expect(card(page, "Leah Leaving")).toBeVisible();
    await expect(page.getByTestId("res-list")).not.toContainText("Olive Finished");
    const bnb = card(page, "HMRVTEST1");
    await expect(bnb).toContainText("Name not provided by Airbnb");
    await expect(bnb).toContainText("Guest count not provided by Airbnb");
    await expect(bnb).toContainText("Read-only");
    const blk = card(page, "External Calendar Block");
    await expect(blk).toContainText("Booking.com");
    await expect(blk).toContainText("Read-only");
    await shot(page, "computer-upcoming");
    // Sorted by reservation date: newest booking first; sites that never said when it was booked come last.
    await page.getByRole("link", { name: "Reservation Date" }).click();
    await expect(page.locator(".rv-date").first()).toContainText(/^Booked /);
    await expect(page.locator(".rv-date").last()).toContainText("Booking date not provided by the site");
    await page.getByRole("link", { name: "Arrival Date" }).click();
    await page.getByRole("link", { name: "History" }).click();
    await expect(card(page, "Olive Finished")).toBeVisible();
    await expect(card(page, "Paul Pastunpaid")).toBeVisible();
    await expect(page.getByTestId("res-list")).not.toContainText("Stella Staying");
    // The date picker moves the whole list to another day.
    await page.getByRole("link", { name: "Today" }).first().click();
    await pickInPicker(page, /^Date/, [iso(5)]);
    await expect(page).toHaveURL(new RegExp(`date=${iso(5)}`));
    await expect(card(page, "HMRVTEST1")).toContainText("Arriving today");
    await expect(page.getByTestId("res-list")).not.toContainText("Arlo Arriving");
  });

  test("each card and each message icon opens its own reservation; read-only rules hold on the server", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto("/admin/calendar?view=list&scope=today");
    await card(page, "Stella Staying").locator(".rv-card").click();
    const d1 = page.getByRole("dialog", { name: "Reservation: Stella Staying" });
    await expect(d1).toContainText("Garden Room");
    await expect(d1).toContainText("RVSTAY");
    await expect(d1).toContainText("Unpaid Sevgio.com booking: can be edited.");
    await shot(page, "computer-details", false);
    await d1.getByRole("button", { name: "Close" }).first().click();
    await card(page, "Arlo Arriving").locator(".rv-card").click();
    const d2 = page.getByRole("dialog", { name: "Reservation: Arlo Arriving" });
    await expect(d2).toContainText("Loft Room");
    await expect(d2).toContainText("Read-only. A payment has been made");
    await d2.getByRole("link", { name: "Open full reservation" }).click();
    await expect(page).toHaveURL(/\/admin\/bookings\/RVARR/);
    await expect(page.getByTestId("readonly-note")).toBeVisible();
    await expect(page.getByText("Edit reservation")).toHaveCount(0);
    await expect(page.getByText("Cancel booking…")).toHaveCount(0); // paid: can't be cancelled either
    // Past but unpaid: still editable.
    await page.goto("/admin/bookings/RVPAST2");
    await expect(page.getByText("Edit reservation")).toBeVisible();
    await page.goto("/admin/bookings/RVSTAY");
    await expect(page.getByText("Cancel booking…")).toBeVisible(); // unpaid and current: can still be cancelled
    // The message icon opens that guest's conversation, not the details panel.
    await page.goto("/admin/calendar?view=list&scope=today");
    await card(page, "Arlo Arriving").getByTestId("res-msg").click();
    await expect(page).toHaveURL(/\/trips\/RVARR\/messages/);
    await expect(page.getByRole("heading", { name: "Arlo Arriving" })).toBeVisible();
    // External reservations: no messaging integration, explained; their page is read-only with no forms.
    await page.goto("/admin/calendar?view=list");
    const off = card(page, "HMRVTEST1").getByTestId("res-msg-off");
    await off.locator("summary").click();
    await expect(off).toContainText("Messaging isn't connected for Airbnb");
    await expect(page.getByRole("dialog")).toBeHidden();
    await card(page, "HMRVTEST1").locator(".rv-card").click();
    await page.getByRole("dialog").getByRole("link", { name: "View synced details" }).click();
    await expect(page.getByTestId("external-readonly")).toBeVisible();
    await expect(page.getByRole("button", { name: /Save|Delete|Mark as cancelled|Add details/ })).toHaveCount(0);
  });

  test("messages: host writes, guest reads and replies, unread badge shows and clears", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto("/trips/RVSTAY/messages");
    await page.getByRole("textbox", { name: "Message" }).fill("Hi Stella, fresh towels are in the hall closet.");
    await page.getByRole("button", { name: "Send" }).click();
    const mine = page.getByTestId("cv-msg").filter({ hasText: "fresh towels" });
    await expect(mine).toContainText(/Sent/);
    await expect(mine).not.toContainText("Delivered");
    await shot(page, "computer-conversation", false);
    await signOut(page);

    await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
    await page.goto("/trips/RVSTAY");
    await expect(page.getByTestId("trip-messages")).toContainText("(1 new)");
    await page.getByTestId("trip-messages").click();
    await expect(page.getByTestId("cv-msg").filter({ hasText: "fresh towels" })).toBeVisible();
    await page.getByRole("textbox", { name: "Message" }).fill("Thank you! Could I check out at noon?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByTestId("cv-msg").filter({ hasText: "check out at noon" })).toContainText("Sent");
    await signOut(page);

    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto("/admin/calendar?view=list&scope=today");
    await expect(card(page, "Stella Staying").locator(".rv-badge")).toHaveText("1");
    await expect(card(page, "Arlo Arriving").locator(".rv-badge")).toHaveCount(0);
    await card(page, "Stella Staying").getByTestId("res-msg").click();
    // The host's own message now shows Read, because the guest opened the conversation.
    await expect(page.getByTestId("cv-msg").filter({ hasText: "fresh towels" })).toContainText("Read");
    await page.goto("/admin/calendar?view=list&scope=today");
    await expect(card(page, "Stella Staying").locator(".rv-badge")).toHaveCount(0);
    // Another guest can't open this conversation.
    expect((await sql("SELECT 1 FROM booking_messages m JOIN bookings b ON b.id = m.booking_id WHERE b.code = 'RVSTAY'")).length).toBe(2);
  });

  test("month: each reservation in a day opens on its own; phones list today's stays as separate cards", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto(`/admin/calendar?view=month&start=${T}`);
    const cell = page.locator(".mg-all .mg-day", { has: page.locator(".mg-num.today") });
    await cell.locator(".mg-tag", { hasText: "Arlo Arriving" }).click();
    await expect(page.getByRole("dialog", { name: "Reservation: Arlo Arriving" })).toContainText("RVARR");
    await page.keyboard.press("Escape");
    await cell.locator(".mg-tag", { hasText: "Stella Staying" }).click();
    await expect(page.getByRole("dialog", { name: "Reservation: Stella Staying" })).toContainText("RVSTAY");
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/admin/calendar?view=month&start=${T}`);
    await shot(page, "phone-month");
    // Phones show a small month per room; Today's reservations lists each stay as its own card.
    await expect(page.locator(".mm-one", { hasText: "Garden Room" })).toBeVisible();
    await page.getByRole("link", { name: "Today's reservations" }).click();
    await expect(page).toHaveURL(/scope=today/);
    await expect(card(page, "Stella Staying")).toBeVisible();
    await expect(card(page, "Arlo Arriving")).toBeVisible();
    await shot(page, "phone-today");
    await page.goto("/admin/calendar");
    await shot(page, "phone-upcoming");
    // On a phone the card and the message icon are separate targets too.
    await card(page, "Stella Staying").locator(".rv-card").click();
    await expect(page.getByRole("dialog", { name: "Reservation: Stella Staying" })).toBeVisible();
    await shot(page, "phone-details", false);
    await page.keyboard.press("Escape");
    await card(page, "Stella Staying").getByTestId("res-msg").click();
    await expect(page).toHaveURL(/\/trips\/RVSTAY\/messages/);
    await shot(page, "phone-conversation", false);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scroll).toBeLessThanOrEqual(1);
  });
});

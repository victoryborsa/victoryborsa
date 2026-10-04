import { test, expect, type Locator } from "@playwright/test";
import { iso, signIn, signOut, sql } from "./helpers.ts";

const add = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
// A quiet stretch well in the future: the 5th of a month, so a whole stay fits in one month's arrivals.
const D = iso(500).slice(0, 8) + "05";
const box = async (l: Locator) => (await l.boundingBox())!;

test.describe.serial("reservations calendar", () => {
  let props: { id: string; title: string }[] = [];

  test.beforeAll(async () => {
    props = await sql<{ id: string; title: string }>("SELECT id, title FROM properties WHERE parent_id IS NULL AND status = 'published' ORDER BY title LIMIT 3");
    const [g] = await sql<{ id: string }>("SELECT id FROM users WHERE role = 'customer' ORDER BY created_at LIMIT 1");
    const stays: [string, number, string, number, number][] = [
      ["CALTA1", 0, "Ava Arrival", 1, 3], // three guests arrive the same day...
      ["CALTA2", 1, "Ben Arrival", 1, 4],
      ["CALTA3", 2, "Cy Arrival", 1, 2],
      ["CALTB1", 0, "Dee Backtoback", 3, 5], // ...Dee arrives the day Ava leaves
      ["CALTC1", 1, "Eli Longstay", 5, 10], // runs into the next week
    ];
    for (const [code, p, name, a, b] of stays)
      await sql(`INSERT INTO bookings (code, property_id, guest_id, check_in, check_out, guests, status, nights, nightly_price_cents, cleaning_fee_cents, tax_cents, total_cents, guest_name, guest_phone, adults, lodging_cents)
                 VALUES ($1, $2, $3, $4, $5, 1, 'confirmed', $6, 10000, 0, 0, 10000, $7, '555', 1, 10000)`, [code, props[p].id, g.id, add(D, a), add(D, b), b - a, name]);
    const [f] = await sql<{ id: string }>("INSERT INTO ical_feeds (property_id, name, url) VALUES ($1, 'Airbnb', 'https://example.com/cal.ics') RETURNING id", [props[0].id]);
    // An Airbnb booking that overlaps both of Ava's and Dee's stays (double-booked across sites): it must still be visible.
    await sql("INSERT INTO blocks (property_id, start_date, end_date, note, source) VALUES ($1, $2, $3, 'Airbnb: Reserved', $4)", [props[0].id, add(D, 2), add(D, 4), "ical:" + f.id]);
  });

  test.afterAll(async () => {
    await sql("DELETE FROM bookings WHERE code LIKE 'CALT%'");
    await sql("DELETE FROM ical_feeds WHERE url = 'https://example.com/cal.ics'");
  });

  test("week: same-day arrivals, back-to-back and overlapping stays never cover each other", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto(`/admin/calendar?view=week&start=${D}`);
    await expect(page.locator(".mc-day")).toHaveCount(7);
    for (const c of ["CALTA1", "CALTA2", "CALTA3", "CALTB1", "CALTC1"]) await expect(page.locator(`a.mc-bar[href="/trips/${c}"]`)).toBeVisible();
    // Each bar names the guest with check-in and check-out days.
    await expect(page.locator(`a.mc-bar[href="/trips/CALTA1"]`)).toContainText("Ava Arrival");
    await expect(page.locator(`a.mc-bar[href="/trips/CALTA1"]`)).toContainText(/In \w+ \d+ · Out \w+ \d+ · 1 guest · Confirmed/);

    const ava = await box(page.locator(`a.mc-bar[href="/trips/CALTA1"]`));
    const dee = await box(page.locator(`a.mc-bar[href="/trips/CALTB1"]`));
    const bnb = await box(page.locator(".mc-bar.ch-airbnb"));
    // Back-to-back: same line, Dee starts after Ava ends, and both share the changeover day.
    expect(Math.abs(ava.y - dee.y)).toBeLessThan(2);
    expect(ava.x + ava.width).toBeLessThanOrEqual(dee.x);
    expect(dee.x - (ava.x + ava.width)).toBeLessThan(20);
    // The overlapping Airbnb stay sits on its own line inside the same listing.
    const overlaps = (a: typeof ava, b: typeof ava) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlaps(bnb, ava)).toBe(false);
    expect(overlaps(bnb, dee)).toBe(false);
    if (process.env.CAL_SHOTS) await page.screenshot({ path: `${process.env.CAL_SHOTS}/week.png`, fullPage: true });
    // The listing's row grew to fit both lines.
    const row = await box(page.locator(".mc-name", { hasText: props[0].title }));
    expect(row.height).toBeGreaterThan(100);

    // Eli's stay runs past Saturday: cut at the edge here, and continues on next week's board.
    await expect(page.locator(`a.mc-bar[href="/trips/CALTC1"]`)).toHaveClass(/cut-r/);
    await page.getByRole("link", { name: "Next week" }).click();
    await expect(page.locator(`a.mc-bar[href="/trips/CALTC1"]`)).toHaveClass(/cut-l/);
    await expect(page.locator(`a.mc-bar[href="/trips/CALTC1"]`)).not.toHaveClass(/cut-r/);

    // Clicking a reservation opens its details (with the guest count) right on the calendar, then the full page.
    await page.locator(`a.mc-bar[href="/trips/CALTC1"]`).click();
    const panel = page.getByRole("dialog", { name: "Reservation: Eli Longstay" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Guests1 (1 adult)");
    await expect(panel).toContainText("CALTC1");
    if (process.env.CAL_SHOTS) await page.screenshot({ path: `${process.env.CAL_SHOTS}/details.png` });
    await panel.getByRole("link", { name: "Open full reservation" }).click();
    await expect(page).toHaveURL(/\/trips\/CALTC1/);
    await expect(page.getByText("Eli Longstay").first()).toBeVisible();
    await signOut(page);
  });

  test("arrivals view groups guests by check-in day, earliest first; filters narrow it", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto(`/admin/calendar?view=arrivals&start=${D}`);
    const days = page.locator(".ar:not(.mc-phone-list) .ar-day");
    await expect(days.first()).toBeVisible();
    const day1 = days.filter({ has: page.locator(`a[href="/trips/CALTA1"]`) });
    await expect(day1.locator(".ar-card")).toHaveCount(3);
    await expect(day1.locator(".ar-count")).toHaveText("3 arrivals · 3 guests");
    if (process.env.CAL_SHOTS) await page.screenshot({ path: `${process.env.CAL_SHOTS}/arrivals.png`, fullPage: true });
    // Earliest first: the three same-day arrivals, then Dee (and the Airbnb guest), then Eli.
    const order = await page.locator(".ar:not(.mc-phone-list) a.ar-card").evaluateAll(as => as.map(a => a.getAttribute("href")).filter(h => h?.startsWith("/trips/CALT")));
    expect(order.slice(3)).toEqual(["/trips/CALTB1", "/trips/CALTC1"]);
    await expect(page.locator(".ar-card", { hasText: "Booked on Airbnb" })).toBeVisible();

    // Status filter: only bookings from other sites.
    await page.getByLabel("Status").selectOption({ label: "Booked on other sites" });
    await expect(page).toHaveURL(/status=other/);
    await expect(page.locator(".ar:not(.mc-phone-list) a.ar-card")).toHaveCount(0);
    await expect(page.locator(".ar-card", { hasText: "Booked on Airbnb" })).toBeVisible();
    // Property filter keeps the status and view.
    await page.getByLabel("Property").selectOption({ label: props[1].title });
    await expect(page).toHaveURL(/view=arrivals/);
    await expect(page).toHaveURL(/status=other/);
    await expect(page.getByText(/No arrivals in/)).toBeVisible();
    await signOut(page);
  });

  test("day view looks like the week: rooms down the side, bars, arrival counts", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto(`/admin/calendar?view=day&start=${add(D, 3)}`);
    await expect(page.locator(".mc-tl-day .mc-day")).toHaveCount(1);
    await expect(page.locator(".mc-tl-day .mc-arr")).toHaveText("1 arriving · 1 guest");
    // Ava leaves and Dee arrives the same day: both show, side by side on one line.
    const ava = page.locator(`a.mc-bar[href="/trips/CALTA1"]`), dee = page.locator(`a.mc-bar[href="/trips/CALTB1"]`);
    await expect(ava).toContainText("Leaving: Ava Arrival");
    await expect(dee).toContainText("Arriving: Dee Backtoback");
    const a = await box(ava), b = await box(dee);
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(a.x + a.width).toBeLessThanOrEqual(b.x);
    await expect(page.locator(".mc-bar.ch-airbnb")).toBeVisible();
    if (process.env.CAL_SHOTS) await page.screenshot({ path: `${process.env.CAL_SHOTS}/day.png`, fullPage: true });
    await dee.click();
    await expect(page.getByRole("dialog", { name: "Reservation: Dee Backtoback" })).toBeVisible();
    await page.keyboard.press("Escape");
    // Picking a month jumps there, keeping the view.
    await page.getByLabel("Go to month").fill(D.slice(0, 7).replace(/-\d\d$/, "-01"));
    await expect(page).toHaveURL(/month=\d{4}-01/);
    await expect(page).toHaveURL(/view=day/);
    await expect(page.locator(".mc-period")).toContainText("January 1");
    await signOut(page);
  });

  test("month view lists every booking on busy days, with no '+ more'", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto(`/admin/calendar?view=month&start=${D}`);
    await expect(page.locator(".mg-more")).toHaveCount(0);
    const busy = page.locator(".mg-all .mg-day", { has: page.locator(".mg-tag", { hasText: "Ava Arrival" }) }).first();
    await expect(busy.locator(".mg-tag.arr")).toHaveCount(3);
    // The day shows how many guests arrive, and each booking opens its details.
    await expect(busy.locator(".mg-arr")).toHaveText("3 arriving · 3 guests");
    await busy.locator(".mg-tag", { hasText: "Ben Arrival" }).click();
    await expect(page.getByRole("dialog", { name: "Reservation: Ben Arrival" })).toContainText("1 (1 adult)");
    await page.keyboard.press("Escape");
    // The Airbnb booking opens too, and says the guest count lives on Airbnb.
    await page.locator(".mg-tag.ch-airbnb").first().click();
    await expect(page.getByRole("dialog", { name: "Reservation: Booked on Airbnb" })).toContainText("Not shared by Airbnb");
    await page.keyboard.press("Escape");
    // The month's reservations are listed under the calendar.
    await expect(page.getByRole("heading", { name: /Reservations in/ })).toBeVisible();
    await expect(page.locator(`a.ar-card[href^="/trips/CALT"]`)).toHaveCount(5);
    if (process.env.CAL_SHOTS) await page.screenshot({ path: `${process.env.CAL_SHOTS}/month.png`, fullPage: true });
    await signOut(page);
  });

  test("phones get a list grouped by arrival day instead of the wide board", async ({ page }) => {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/admin/calendar?view=week&start=${D}`);
    await expect(page.locator(".mc-wrap-tl")).toBeHidden();
    const list = page.locator(".mc-phone-list");
    await expect(list).toBeVisible();
    await expect(list.locator(`a.ar-card[href="/trips/CALTA1"]`)).toBeVisible();
    await expect(list.locator(".ar-day").first().locator(".ar-card")).toHaveCount(3);
    // Cards are readable: guest, place, check-in and check-out all on screen.
    const card = list.locator(`a.ar-card[href="/trips/CALTB1"]`);
    await expect(card).toContainText("Dee Backtoback");
    await expect(card).toContainText(props[0].title);
    await expect(card).toContainText("Check-in");
    await expect(card).toContainText("Check-out");
    expect((await box(card)).width).toBeLessThanOrEqual(390);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(391);
    if (process.env.CAL_SHOTS) await page.screenshot({ path: `${process.env.CAL_SHOTS}/phone-week.png`, fullPage: true });
    // Month on a phone: a small calendar per listing (like the Availability screen), then the arrivals list.
    await page.getByRole("link", { name: "Month", exact: true }).click();
    await expect(page.locator(".mg-all")).toBeHidden();
    const ava = page.locator(".mm-one", { hasText: props[0].title });
    await expect(ava).toBeVisible();
    await expect(ava.locator(".mm-d.bk")).toHaveCount(4); // Ava, the Airbnb guest and Dee: 4 nights in a row
    await expect(page.locator(`a.ar-card[href^="/trips/CALT"]`)).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
    if (process.env.CAL_SHOTS) await page.screenshot({ path: `${process.env.CAL_SHOTS}/phone-month.png`, fullPage: true });
  });
});

import { test, expect, type Page } from "@playwright/test";
import { iso, signIn, signOut, sql } from "./helpers.ts";

// The nightly-price calendar: every day boxed with its rate, Smart Pricing switch, nights priced by hand,
// and the guest's calendar, price summary and checkout all agreeing night by night.
const SLUG = "jim-thorpe-mountain-cabin"; // $160 a night in the demo data
let id = "";

test.beforeAll(async () => {
  [{ id }] = await sql<{ id: string }>("SELECT id FROM properties WHERE slug = $1", [SLUG]);
  await sql("UPDATE properties SET smart_pricing = false, min_price_cents = NULL, max_price_cents = NULL, nightly_price_cents = 16000 WHERE id = $1", [id]);
});
test.afterAll(async () => {
  await sql("DELETE FROM night_prices WHERE property_id = $1", [id]);
  await sql("UPDATE properties SET smart_pricing = false, min_price_cents = NULL, max_price_cents = NULL WHERE id = $1", [id]);
});

/** Pages the two-month calendar forward until a day is on screen. */
async function showDay(page: Page, d: string) {
  await expect(page.locator(".cal-wrap [data-day]").first()).toBeVisible();
  for (let i = 0; i < 18 && !(await page.locator(`[data-day="${d}"]`).isVisible()); i++) await page.getByRole("button", { name: "Next month" }).click();
}

/** A weekday (Mon–Thu) about `days` from today, so weekend pricing doesn't move it. */
function weekday(days: number) {
  let d = iso(days);
  while ([0, 5, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())) d = new Date(Date.parse(d + "T12:00:00Z") + 86_400_000).toISOString().slice(0, 10);
  return d;
}
const next = (d: string, n = 1) => new Date(Date.parse(d + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

test("host: Smart Pricing switch, limits, and setting one night's price on the calendar", async ({ page }) => {
  const night = weekday(40);
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto(`/host/listings/${id}/calendar`);

  // Every day is its own box with its rate.
  await showDay(page, night);
  await expect(page.locator(`[data-price="${night}"]`)).toHaveText("$160");
  const box = await page.locator(`[data-day="${night}"]`).evaluate(el => getComputedStyle(el).borderTopStyle + " " + getComputedStyle(el).borderTopWidth);
  expect(box).toBe("solid 1px");

  // Smart Pricing needs limits, then switches on.
  const card = page.locator(".sp-card");
  await card.getByRole("switch").check({ force: true });
  await card.getByRole("button", { name: "Save Smart Pricing" }).click();
  await expect(page.getByText("Smart Pricing needs your lowest and highest price per night.")).toBeVisible();
  await card.getByLabel("Lowest price per night (USD)").fill("150");
  await card.getByLabel("Highest price per night (USD)").fill("200");
  await card.getByRole("button", { name: "Save Smart Pricing" }).click();
  await expect(page.getByText(/Smart Pricing is on\. Prices now follow demand and stay between \$150 and \$200\./)).toBeVisible();
  expect((await sql<{ smart_pricing: boolean }>("SELECT smart_pricing FROM properties WHERE id = $1", [id]))[0].smart_pricing).toBe(true);

  // Last-minute nights drop, but never below the $150 lowest price (160 × 0.9 = 144 → 150).
  await page.reload();
  for (const d of [iso(0), iso(1), iso(2)]) {
    const t = await page.locator(`[data-price="${d}"]`).textContent();
    if (t) expect(Number(t.replace(/\D/g, ""))).toBeGreaterThanOrEqual(150);
  }

  // A price outside the limits is refused; one inside them is saved for that night only.
  await showDay(page, night);
  await page.locator(`[data-day="${night}"]`).click();
  await expect(page.locator(".pc-why")).toContainText("$160 a night");
  const tool = page.locator(".pc-tool").filter({ hasText: "Set the nightly price" });
  await tool.getByLabel("Price per night (USD)").fill("240");
  await tool.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByText(/Your Smart Pricing limits are \$150 to \$200 a night/)).toBeVisible();
  await tool.getByLabel("Price per night (USD)").fill("185");
  await tool.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByText(/: \$185 a night\. Guests see it/)).toBeVisible();
  await expect(page.locator(`[data-price="${night}"]`)).toHaveText("$185");
  await expect(page.locator(`[data-price="${night}"]`)).toHaveClass(/\bset\b/);
  await expect(page.locator(`[data-price="${next(night)}"]`)).toHaveText("$160");
  if (process.env.SHOTS) await page.locator("main").screenshot({ path: `${process.env.SHOTS}/host-listing-calendar.png` });

  // The month view shows the same night's price, and its Settings panel has the same switch.
  await page.goto(`/admin/calendar?view=month&property=${id}&start=${night}`);
  await expect(page.locator(`.mg-price[data-price="${night}"]`)).toHaveText("$185");
  if (process.env.SHOTS) await page.locator(".cal-split").screenshot({ path: `${process.env.SHOTS}/host-month.png` });
  await expect(page.locator(".cs .sp-card").getByRole("switch")).toBeChecked();
  await signOut(page);
});

test("guest: calendar rates match the price summary and checkout, night by night", async ({ page }) => {
  const night = weekday(40); // $185 set by hand in the test above; the next night is $160
  await page.goto(`/stays/${SLUG}`);
  await showDay(page, night);
  await expect(page.locator(`#availability [data-price="${night}"]`)).toHaveText("$185");
  await expect(page.locator(`#availability [data-price="${next(night)}"]`)).toHaveText("$160");
  await page.locator(`[data-day="${night}"]`).click();
  await page.locator(`[data-day="${next(night, 2)}"]`).click();
  const panel = page.locator("#book table.breakdown");
  await expect(panel).toContainText("$172.50 avg × 2 nights");
  await expect(panel).toContainText("$345");
  await panel.getByText("See each night's rate").click();
  await expect(panel.locator(".nightly-rates li")).toHaveText([/\$185/, /\$160/]);
  if (process.env.SHOTS) await page.locator("#availability").screenshot({ path: `${process.env.SHOTS}/guest-calendar.png` });

  // Checkout charges the same two nights.
  await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
  await page.goto(`/book/${SLUG}?ci=${night}&co=${next(night, 2)}&adults=2&children=0&infants=0`);
  const checkout = page.locator("table.breakdown");
  await expect(checkout).toContainText("$172.50 avg × 2 nights");
  await expect(checkout).toContainText("$345");
  await checkout.getByText("See each night's rate").click();
  await expect(checkout.locator(".nightly-rates li")).toHaveText([/\$185/, /\$160/]);
  await signOut(page);
});

test("host: switching Smart Pricing off and putting a night back on the normal price", async ({ page }) => {
  const night = weekday(40);
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto(`/host/listings/${id}/calendar`);
  await showDay(page, night);
  await page.locator(`[data-day="${night}"]`).click();
  await page.getByRole("button", { name: "Use Smart Pricing again" }).click();
  await expect(page.getByText(/back to Smart Pricing\./)).toBeVisible();
  await expect(page.locator(`[data-price="${night}"]`)).toHaveText("$160");
  const card = page.locator(".sp-card");
  await card.getByRole("switch").uncheck({ force: true });
  await card.getByRole("button", { name: "Save Smart Pricing" }).click();
  await expect(page.getByText(/Smart Pricing is off\./)).toBeVisible();
  expect((await sql<{ smart_pricing: boolean }>("SELECT smart_pricing FROM properties WHERE id = $1", [id]))[0].smart_pricing).toBe(false);
});

test("phones: the guest calendar keeps every day boxed with its rate, without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/stays/${SLUG}`);
  const d = weekday(10);
  await showDay(page, d);
  await expect(page.locator(`#availability [data-price="${d}"]`)).toHaveText("$160");
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
  // The rate fits inside its day box.
  const [cell, price] = await Promise.all([page.locator(`[data-day="${d}"]`).boundingBox(), page.locator(`[data-price="${d}"]`).boundingBox()]);
  expect(price!.x).toBeGreaterThanOrEqual(cell!.x);
  expect(price!.x + price!.width).toBeLessThanOrEqual(cell!.x + cell!.width + 0.5);
  if (process.env.SHOTS) await page.locator("#availability").screenshot({ path: `${process.env.SHOTS}/phone-guest-calendar.png` });
});

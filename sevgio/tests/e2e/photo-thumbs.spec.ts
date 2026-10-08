import { test, expect, type Page } from "@playwright/test";
import { THUMB_CREDITS } from "../../lib/thumbs.ts";

// Category, amenity, service and guest-type icons are small real photos. Each one must load, and the license credits must list every photo.

async function thumbsLoaded(page: Page, path: string, min: number) {
  await page.goto(path);
  const thumbs = page.locator("img.thumb");
  await expect.poll(() => thumbs.count(), { message: path }).toBeGreaterThanOrEqual(min);
  // Lazy photos load as they scroll into view; scroll each one in, then check it decoded.
  for (const img of await thumbs.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), { message: path }).toBe(160);
  }
}

test("homepage, stays, events, Pittsburgh guide and corporate housing show photo thumbnails that load", async ({ page }) => {
  await thumbsLoaded(page, "/", 10);          // 7 category tabs + 3 promos
  await thumbsLoaded(page, "/stays", 16);     // 16 quick-filter pills
  await thumbsLoaded(page, "/events", 16);    // team and category pills + official schedules
  await thumbsLoaded(page, "/pittsburgh", 12); // 9 section tabs + 3 getting-around tips
  await thumbsLoaded(page, "/corporate-housing", 15); // who we host, what's included, coordinators
});

test("functional icons stay icons: the Filters button keeps its funnel, not a photo", async ({ page }) => {
  await page.goto("/stays");
  await expect(page.locator(".chip-filters img")).toHaveAttribute("src", "/icons/filters/filters.svg");
});

test("photo credits page names the photographer and license for every photo", async ({ page }) => {
  await page.goto("/photo-credits");
  await expect(page.getByRole("heading", { name: "Photo credits", level: 1 })).toBeVisible();
  await expect(page.locator(".credits li")).toHaveCount(Object.keys(THUMB_CREDITS).length);
  await expect(page.locator(".credits a[href^='https://www.flickr.com/']")).toHaveCount(Object.keys(THUMB_CREDITS).length);
  await page.goto("/");
  await expect(page.locator("footer").getByRole("link", { name: "Photo credits" }).first()).toBeVisible();
});

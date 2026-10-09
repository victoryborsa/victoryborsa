import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { sql, iso, signIn, signOut, pickInPicker } from "./helpers.ts";

const GROUPS = [
  { slug: "travel-nurses", label: "Travel nurses", sub: "Your Pittsburgh home between shifts.", text: "whether you work day or night shifts", button: "Request Travel Nurse Housing", who: "Travel nurse or medical staff" },
  { slug: "doctors-and-residents", label: "Doctors and residents", sub: "A comfortable place to rest, study, and settle in.", text: "clinical rotation, residency transition, fellowship", button: "Request Medical Professional Housing", who: "Doctor or resident" },
  { slug: "corporate-teams", label: "Corporate teams", sub: "Furnished stays for business assignments and project teams.", text: "whether each employee needs a separate bedroom", button: "Request Team Housing", who: "Corporate team" },
  { slug: "contractors", label: "Contractors", sub: "A practical home base for the length of your project.", text: "work trucks, trailers, or equipment", button: "Request Contractor Housing", who: "Contractor or crew" },
  { slug: "relocating-families", label: "Relocating families", sub: "Settle into Pittsburgh while you plan your next move.", text: "school enrollment requirements", button: "Request Family Relocation Housing", who: "Relocating family" },
];
const NOTE = "Property features, utilities, parking, pet policies, rates, and minimum stays vary by listing.";

const btn = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true });
const panel = (page: Page, slug: string) => page.locator(`#panel-${slug}`);

test.afterAll(async () => {
  await sql("DELETE FROM site_photos WHERE slot LIKE 'audience:%'");
});

test("who we host: every description is in the page's HTML for search engines", async ({ request }) => {
  const html = await (await request.get("/corporate-housing")).text();
  for (const g of GROUPS) {
    expect(html).toContain(g.sub);
    expect(html).toContain(g.text);
    expect(html).toContain(g.button);
  }
  expect(html.split(NOTE).length - 1).toBe(5);
  expect(html).not.toMatch(/—/);
});

test("who we host on a computer: each button opens its own panel with a photo beside the text", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/corporate-housing");
  for (const g of GROUPS) await expect(panel(page, g.slug)).toBeHidden();

  for (const [i, g] of GROUPS.entries()) {
    // The icon is part of the button, so clicking it opens the panel too.
    if (i % 2) await btn(page, g.label).locator("svg").click();
    else await btn(page, g.label).click();
    await expect(btn(page, g.label)).toHaveAttribute("aria-expanded", "true");
    for (const o of GROUPS.filter(o => o !== g)) {
      await expect(btn(page, o.label)).toHaveAttribute("aria-expanded", "false");
      await expect(panel(page, o.slug)).toBeHidden();
    }
    const p = panel(page, g.slug);
    await expect(p.getByRole("heading", { level: 3 })).toHaveText(g.label);
    await expect(p).toContainText(g.sub);
    await expect(p).toContainText(g.text);
    await expect(p).toContainText(NOTE);
    await expect(p.getByRole("link", { name: g.button })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#${g.slug}$`));

    // Its own photo, loaded, with its size reserved, marked as illustrative.
    const img = p.locator("img");
    await expect(img).toHaveAttribute("width", /\d+/);
    await expect(img).toHaveAttribute("height", /\d+/);
    await expect(img).toHaveAttribute("alt", /.+/);
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    await expect(img).toHaveAttribute("src", `/img/audiences/${g.slug}-960.webp`);
    await expect(p.locator("figcaption")).toHaveText("Illustrative photo, not a Sevgio listing.");
    const [ib, hb] = [await img.boundingBox(), await p.getByRole("heading", { level: 3 }).boundingBox()];
    expect(ib!.x + ib!.width).toBeLessThanOrEqual(hb!.x);
  }
  // Each group shows a different photo.
  const srcs = new Set<string>();
  for (const g of GROUPS) srcs.add((await panel(page, g.slug).locator("img").getAttribute("src"))!);
  expect(srcs.size).toBe(5);

  // Clicking the open button again closes its panel.
  await btn(page, "Relocating families").click();
  await expect(panel(page, "relocating-families")).toBeHidden();
  await expect(btn(page, "Relocating families")).toHaveAttribute("aria-expanded", "false");
});

test("who we host: each Request button fills in the form, and the request reaches Admin messages", async ({ page }) => {
  await page.goto("/corporate-housing");
  for (const g of GROUPS) {
    await btn(page, g.label).click();
    await panel(page, g.slug).getByRole("link", { name: g.button }).click();
    await expect(page.locator("#request select[name=who]")).toHaveValue(g.who);
    await expect(page.locator("#request input[name=name]")).toBeFocused();
  }
  await page.locator("#request input[name=name]").fill("Dana Kowalski");
  await page.locator("#request input[name=email]").fill("dana.kowalski@example.com");
  await pickInPicker(page, /^Move-in date/, [iso(30)]);
  await page.locator("#request input[name=guests]").fill("4");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Request sent\. We'll reply to dana\.kowalski@example\.com/)).toBeVisible();
  const [m] = await sql<{ body: string; email: string }>("SELECT body, email FROM messages ORDER BY created_at DESC LIMIT 1");
  expect(m.email).toBe("dana.kowalski@example.com");
  expect(m.body).toContain("I am: Relocating family");
  expect(m.body).toContain("Guests: 4");
});

test("who we host with the keyboard: arrows move between buttons, Enter and Space open, Tab reaches the panel", async ({ page }) => {
  await page.goto("/corporate-housing");
  await btn(page, "Travel nurses").focus();
  await page.keyboard.press("ArrowRight");
  await expect(btn(page, "Doctors and residents")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel(page, "doctors-and-residents")).toBeVisible();
  await page.keyboard.press("End");
  await expect(btn(page, "Relocating families")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(panel(page, "relocating-families")).toBeVisible();
  await expect(panel(page, "doctors-and-residents")).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(btn(page, "Travel nurses")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(btn(page, "Relocating families")).toBeFocused();
  // Tab goes from the last button straight to the open panel's Request button.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Request Family Relocation Housing" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#request select[name=who]")).toHaveValue("Relocating family");
});

test("who we host on a phone: photo above the text, nothing wider than the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/corporate-housing");
  await btn(page, "Contractors").click();
  const p = panel(page, "contractors");
  await expect(p).toBeVisible();
  const [ib, hb] = [await p.locator("img").boundingBox(), await p.getByRole("heading", { level: 3 }).boundingBox()];
  expect(ib!.y + ib!.height).toBeLessThanOrEqual(hb!.y);
  expect(ib!.width).toBeGreaterThan(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const cta = p.getByRole("link", { name: "Request Contractor Housing" });
  await cta.click();
  await expect(page.locator("#request select[name=who]")).toHaveValue("Contractor or crew");
});

test("who we host: links open a group, without JavaScript too, and reduced motion turns off the fade", async ({ page, browser }) => {
  await page.goto("/corporate-housing#corporate-teams");
  await expect(panel(page, "corporate-teams")).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/corporate-housing?for=travel-nurses");
  await expect(panel(page, "travel-nurses")).toBeVisible();
  await expect(page.locator("#request select[name=who]")).toHaveValue("Travel nurse or medical staff");
  expect(await panel(page, "travel-nurses").evaluate(el => getComputedStyle(el).animationName)).toBe("none");

  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const nojs = await ctx.newPage();
  await nojs.goto(new URL("/corporate-housing?for=contractors", page.url()).href);
  await expect(panel(nojs, "contractors")).toBeVisible();
  await panel(nojs, "contractors").getByRole("link", { name: "Request Contractor Housing" }).click();
  await expect(nojs.locator("#request select[name=who]")).toHaveValue("Contractor or crew");
  await ctx.close();
});

test("admin can give a group its own photo, describe it, and remove it", async ({ page }) => {
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin/settings#corporate-photos");
  const tile = page.locator("#corporate-photos .photo-tile", { hasText: "Travel nurses" });
  await tile.locator("input[type=file]").setInputFiles(path.join(import.meta.dirname, "../../public/img/pittsburgh-skyline.jpg"));
  await tile.getByRole("button", { name: /Upload|Add photo/ }).click();
  await expect(tile.locator("img")).toBeVisible();
  await tile.getByLabel("Photo description for Travel nurses").fill("Nurse relaxing on a sofa after a shift");
  await tile.getByRole("button", { name: "Save" }).click();
  await expect(tile.getByLabel("Photo description for Travel nurses")).toHaveValue("Nurse relaxing on a sofa after a shift");

  await page.goto("/corporate-housing#travel-nurses");
  const img = panel(page, "travel-nurses").locator("img");
  await expect(img).toHaveAttribute("src", /\/api\/site-photos\//);
  await expect(img).toHaveAttribute("alt", "Nurse relaxing on a sofa after a shift");
  await expect(panel(page, "travel-nurses").locator("figcaption")).toHaveCount(0);

  await page.goto("/admin/settings#corporate-photos");
  await tile.getByRole("button", { name: "Remove photo" }).click();
  await expect(tile.locator("img")).toHaveCount(0);
  await page.goto("/corporate-housing#travel-nurses");
  await expect(panel(page, "travel-nurses").locator("img")).toHaveAttribute("src", "/img/audiences/travel-nurses-960.webp");
  await signOut(page);
});

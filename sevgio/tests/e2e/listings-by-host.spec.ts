import { test, expect } from "@playwright/test";
import { signIn, signOut, sql } from "./helpers.ts";

const az = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true });

async function expected() {
  const rows = await sql<{ host_id: string; host_name: string; title: string }>("SELECT p.host_id, u.name AS host_name, p.title FROM properties p JOIN users u ON u.id = p.host_id");
  const hosts = [...new Map(rows.map(r => [r.host_id, r.host_name])).entries()].sort((a, b) => az(a[1], b[1]));
  return hosts.map(([id, name]) => ({ id, name, titles: rows.filter(r => r.host_id === id).map(r => r.title).sort(az) }));
}

test("admin listings are grouped by host, A–Z, with a host filter", async ({ page }) => {
  const want = await expected();
  expect(want.length).toBeGreaterThan(1);
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");

  // Host tools → Listings (the table with Edit · Photos · Delete · Calendar · View).
  await page.goto("/host/listings");
  await expect(page.locator(".host-head .host-name")).toHaveText(want.map(h => h.name));
  for (const [i, h] of want.entries()) {
    await expect(page.locator("tbody.host-group").nth(i).locator("td strong")).toHaveText(h.titles);
  }
  const first = page.locator("tbody.host-group").first().locator("tr").nth(1);
  for (const name of ["Edit", "Photos", "Delete", "Calendar", "View"]) await expect(first.getByRole("link", { name })).toBeVisible();

  const one = want[want.length - 1];
  await page.getByLabel("Host", { exact: true }).selectOption(one.id);
  await expect(page).toHaveURL(new RegExp(`host=${one.id}`));
  await expect(page.locator(".host-head .host-name")).toHaveText([one.name]);
  await expect(page.locator("tbody.host-group td strong")).toHaveText(one.titles);
  await page.getByLabel("Host", { exact: true }).selectOption("");
  await expect(page.locator(".host-head .host-name")).toHaveText(want.map(h => h.name));

  // Admin → Listings shows the same grouping.
  await page.goto("/admin/listings");
  await expect(page.locator(".al-host")).toHaveCount(want.length);
  for (const [i, h] of want.entries()) {
    await expect(page.locator(".al-host").nth(i)).toContainText(h.name);
    await expect(page.locator(`.al-card[data-host="${h.id}"] .al-title strong`)).toHaveText(h.titles);
  }
  await page.getByLabel("Host", { exact: true }).selectOption(one.id);
  await expect(page.locator(".al-host")).toHaveCount(1);
  await expect(page.locator(".al-title strong")).toHaveText(one.titles);
  await signOut(page);

  // Hosts still see a plain list of their own listings, with no host filter.
  await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
  await page.goto("/host/listings");
  await expect(page.getByLabel("Host", { exact: true })).toHaveCount(0);
  await expect(page.locator(".host-head")).toHaveCount(0);
  await signOut(page);
});

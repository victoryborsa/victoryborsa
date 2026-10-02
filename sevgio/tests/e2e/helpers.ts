import { expect, type Page } from "@playwright/test";
import pg from "pg";

export const DB = process.env.E2E_DATABASE_URL || "postgres://sevgio:sevgio@localhost:5432/sevgio_test";
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  try { return (await c.query(text, params)).rows as T[]; } finally { await c.end(); }
}

export const iso = (daysFromToday: number) => {
  const t = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  return new Date(Date.parse(t + "T00:00:00Z") + daysFromToday * 86400000).toISOString().slice(0, 10);
};

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
}

/** Clicks check-in and check-out days on the property calendar, paging forward to the right month. */
export async function pickDates(page: Page, ci: string, co: string) {
  // The page shows a loading placeholder first; wait for the real calendar before paging through it.
  await expect(page.locator(".cal-wrap [data-day]").first()).toBeVisible();
  for (const d of [ci, co]) {
    for (let i = 0; i < 18 && !(await page.locator(`[data-day="${d}"]`).isVisible()); i++) await page.getByRole("button", { name: "Next month" }).click();
    await page.locator(`[data-day="${d}"]`).click();
  }
}

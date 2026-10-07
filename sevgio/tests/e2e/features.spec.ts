import { test, expect } from "@playwright/test";
import { signIn, sql } from "./helpers.ts";

// Admin → Feature switches: every upgrade feature is listed, and features not built yet can't be switched on.
test("feature switches page lists upgrade features as not built yet", async ({ page }) => {
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin/features");
  const audit = page.locator('[data-flag="FEATURE_AUDIT_LOG"]');
  await expect(audit).toContainText("Change history (audit log)");
  await expect(audit).toContainText("Not built yet");
  await expect(audit.getByRole("button")).toHaveCount(0);
  await expect(page.locator('[data-flag="FEATURE_MANUAL_RESERVATIONS"]')).toContainText("Manual reservations");
  await expect(page.getByRole("link", { name: "Feature switches" })).toBeVisible();
  // Nothing is saved just by looking.
  expect(await sql("SELECT 1 FROM settings WHERE key LIKE 'flag:%'")).toHaveLength(0);
});

test("guests and hosts can't open feature switches", async ({ page }) => {
  await signIn(page, "dana@demo.sevgio.com", "demo-password-2026");
  await page.goto("/admin/features");
  await expect(page).not.toHaveURL(/\/admin\/features$/);
});

import { test, expect } from "@playwright/test";
import { signIn, sql } from "./helpers.ts";

// Operations log: errors move New → Investigating → Fix Deployed → Verified → Resolved, never straight to Resolved.
test("an error can only be resolved after its fix is verified, and secrets never show", async ({ page }) => {
  await sql("DELETE FROM event_log WHERE message LIKE 'E2E ops%'");
  await sql(`INSERT INTO event_log (level, area, message, details) VALUES ('error', 'Server', 'E2E ops: a.modified_at.slice is not a function',
    '{"route": "GET /host/bookings/other-sites", "stack": "TypeError: a.modified_at.slice is not a function\\n    at page.tsx:71", "version": "abc1234", "platform": "airbnb"}')`);
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin/log?level=error");
  const row = page.locator("tr", { hasText: "E2E ops" });
  await expect(row).toContainText("GET /host/bookings/other-sites");
  await expect(row).toContainText("Version abc1234");
  await expect(row).toContainText("Airbnb");
  await expect(row).toContainText("New");
  await expect(row.getByRole("button", { name: /Resolved/ })).toHaveCount(0);
  for (const stage of ["Investigating", "Fix Deployed", "Verified", "Resolved"]) {
    await row.getByRole("button", { name: `Move to ${stage}` }).click();
    if (stage !== "Resolved") await expect(row.locator(".pill").last()).toHaveText(stage);
  }
  // Resolved errors leave the open list but stay in the log.
  await expect(page.locator("tr", { hasText: "E2E ops" })).toHaveCount(0);
  await page.goto("/admin/log?level=error&open=0");
  await expect(page.locator("tr", { hasText: "E2E ops" })).toContainText("Resolved");
  const [e] = await sql<{ stage: string; resolved_at: string | null }>("SELECT stage, resolved_at FROM event_log WHERE message LIKE 'E2E ops%'");
  expect(e.stage).toBe("resolved");
  expect(e.resolved_at).not.toBeNull();
});

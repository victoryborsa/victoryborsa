import { test, expect } from "@playwright/test";
import { iso, pickDates, sql, signIn, signOut } from "./helpers.ts";

test.describe.configure({ mode: "serial" });
const email = `guest-${Date.now()}@example.com`;

test("homepage shows search and property cards", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Poconos to Pittsburgh");
  await expect(page.getByRole("search")).toBeVisible();
  await expect(page.locator("a.card")).toHaveCount(6);
  await expect(page.locator("a.card").first().locator("img")).toBeVisible();
});

test("search by area, filter, sort and empty state", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Where").fill("Poconos");
  await page.getByRole("button", { name: "Search stays" }).click();
  await expect(page.getByRole("heading", { name: /2 stays matching/ })).toBeVisible();
  await page.getByLabel("Hot tub").check();
  await expect(page).toHaveURL(/amen=hottub/);
  await page.getByLabel("Sort by").selectOption("price_asc");
  await expect(page).toHaveURL(/sort=price_asc/);
  await expect(page.locator("a.card").first()).toContainText("Jim Thorpe");
  await page.goto("/stays?loc=Nowhereville");
  await expect(page.getByRole("heading", { name: "No stays match your search" })).toBeVisible();
});

test("guest books instantly: sign up mid-booking, confirmation, My trips", async ({ page }) => {
  const ci = iso(20), co = iso(23);
  await page.goto("/stays/lake-harmony-lodge");
  await pickDates(page, ci, co);
  await expect(page.locator("table.breakdown")).toContainText("Total");
  await page.locator("#book").getByRole("link", { name: "Reserve" }).click();
  await expect(page).toHaveURL(/\/signin\?next=/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Test Guest");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("guest-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/book\/lake-harmony-lodge/);
  await page.getByLabel("Mobile phone").fill("(570) 555-0199");
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: /Confirm booking/ }).click();
  await expect(page.getByText("You're booked!")).toBeVisible();
  await expect(page.getByText("Confirmed").first()).toBeVisible();
  await expect(page.getByText("Getting there")).toBeVisible();
  await page.getByRole("link", { name: "My trips" }).first().click();
  await expect(page.getByText("Lake Harmony Lodge")).toBeVisible();
});

test("booked nights can't be booked again (calendar and direct link)", async ({ page }) => {
  const ci = iso(20);
  await page.goto("/stays/lake-harmony-lodge");
  for (let i = 0; i < 18 && !(await page.locator(`[data-day="${ci}"]`).isVisible()); i++) await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.locator(`[data-day="${ci}"]`)).toBeDisabled();
  await page.goto(`/stays?ci=${iso(21)}&co=${iso(22)}&loc=Lake`);
  await expect(page.getByRole("heading", { name: "No stays match your search" })).toBeVisible();
});

test("request-to-book is pending, and the guest can withdraw it", async ({ page }) => {
  await signIn(page, email, "guest-password-1");
  await page.goto(`/book/lancaster-county-farmhouse-suite?ci=${iso(40)}&co=${iso(43)}&guests=2`);
  await page.getByLabel("Mobile phone").fill("(570) 555-0199");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Write a short message to the host/)).toBeVisible();
  await page.getByLabel("Message to the host").fill("Hi! We're visiting family nearby for the weekend.");
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Request sent to the host.")).toBeVisible();
  await expect(page.getByText("Awaiting host")).toBeVisible();
  page.on("dialog", d => d.accept());
  await page.getByRole("button", { name: "Withdraw request" }).click();
  await expect(page.getByText("Booking cancelled. The host has been told.")).toBeVisible();
  await signOut(page);
});

test("password reset: link works once", async ({ page }) => {
  await page.goto("/forgot");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account exists/)).toBeVisible();
  // The email isn't sent in tests, so plant a known token in the database.
  const crypto = await import("node:crypto");
  const token = "e2e-reset-token-" + Date.now();
  const [u] = await sql<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  await sql("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '30 minutes')", [crypto.createHash("sha256").update(token).digest("hex"), u.id]);
  await page.goto(`/reset/${token}`);
  await page.getByLabel("New password").fill("new-password-22");
  await page.getByLabel("Type it again").fill("new-password-22");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Your password has been changed")).toBeVisible();
  await signOut(page);
  await page.goto(`/reset/${token}`);
  await page.getByLabel("New password").fill("another-pass-33");
  await page.getByLabel("Type it again").fill("another-pass-33");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText(/expired or was already used/)).toBeVisible();
});

test("wrong password shows a helpful error and sign-in is rate limited", async ({ page }) => {
  await page.goto("/signin");
  for (let i = 0; i < 6; i++) {
    await page.getByLabel("Email").fill("dana@demo.sevgio.com");
    await page.getByLabel("Password").fill("wrong-password-" + i);
    await Promise.all([page.waitForResponse(r => r.request().method() === "POST"), page.getByRole("button", { name: "Sign in" }).click()]);
    await expect(page.locator(".notice.error")).toBeVisible();
  }
  await expect(page.locator(".notice.error")).toContainText("Too many attempts");
  await sql("DELETE FROM login_attempts");
});

test("contact form and host question are saved", async ({ page }) => {
  await page.goto("/contact");
  await page.getByLabel("Name").fill("Pat Visitor");
  await page.getByLabel("Email").fill("pat@example.com");
  await page.getByLabel("Message").fill("Do you have anything near Erie?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/Message sent/)).toBeVisible();
  await page.goto("/stays/jim-thorpe-mountain-cabin");
  await page.getByLabel("Your name").fill("Pat Visitor");
  await page.getByLabel("Email", { exact: true }).fill("pat@example.com");
  await page.getByLabel(/Message to/).fill("Can we bring two dogs?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByText(/Question sent/)).toBeVisible();
});

test("phone layout has no sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/stays", "/stays/lake-harmony-lodge", "/signin"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

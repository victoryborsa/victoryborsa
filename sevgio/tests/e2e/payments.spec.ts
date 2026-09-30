import { test, expect, type Page } from "@playwright/test";
import Stripe from "stripe";
import { iso, signIn, signOut, sql } from "./helpers.ts";

test.describe.configure({ mode: "serial" });

async function setPayments(page: Page, opts: { zelle?: boolean; venmo?: boolean; cash?: boolean }) {
  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin/settings");
  const box = (label: RegExp, on?: boolean) => (on ? page.getByLabel(label).check() : page.getByLabel(label).uncheck());
  await page.getByLabel("Zelle: send to (email or phone)").fill("pay@sevgio.test");
  await page.getByLabel("Venmo username").fill("@Sevgio-Test");
  await box(/^Zelle \(free\)/, opts.zelle);
  await box(/^Venmo\. You confirm/, opts.venmo);
  await box(/^Cash at arrival/, opts.cash);
  await page.getByLabel("Deposit for cash at arrival (%)").fill("30");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/Settings saved/)).toBeVisible();
  await signOut(page);
}

async function book(page: Page, slug: string, ci: number, co: number, method: RegExp) {
  await page.goto(`/book/${slug}?ci=${iso(ci)}&co=${iso(co)}&adults=2`);
  await page.getByLabel("Mobile phone").fill("(570) 555-0100");
  await page.getByLabel(method).check();
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Book and pay" }).click();
}

test("Zelle: dates are held until the host marks the payment received", async ({ page }) => {
  await setPayments(page, { zelle: true, venmo: true, cash: true });
  await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
  await book(page, "rittenhouse-square-loft", 200, 202, /^Zelle/);
  await expect(page.getByRole("heading", { name: "Payment needed to confirm" })).toBeVisible();
  await expect(page.getByText("pay@sevgio.test")).toBeVisible();
  await expect(page.getByText("Awaiting payment").first()).toBeVisible();
  const code = (await page.locator(".code").textContent())!.trim();
  await page.goto(`/stays?ci=${iso(200)}&co=${iso(202)}&loc=Philadelphia`);
  await expect(page.getByRole("heading", { name: "No stays match your search" })).toBeVisible();
  await signOut(page);

  await signIn(page, "marcus@demo.sevgio.com", "demo-password-2026");
  await page.goto("/host/bookings?view=upcoming");
  const row = page.locator("tr", { hasText: code });
  await expect(row).toContainText("Waiting");
  page.on("dialog", d => d.accept());
  await row.getByText("Mark payment received").click();
  await row.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment recorded.")).toBeVisible();
  const [b] = await sql<{ status: string; payment_status: string }>("SELECT status, payment_status FROM bookings WHERE code = $1", [code]);
  expect(b).toEqual({ status: "confirmed", payment_status: "paid" });
  await signOut(page);
});

test("cash at arrival: deposit now, the rest at check-in", async ({ page }) => {
  await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
  await book(page, "rittenhouse-square-loft", 210, 212, /^Cash at arrival/);
  const code = (await page.locator(".code").textContent())!.trim();
  const [b] = await sql<{ total_cents: number; due_now_cents: number }>("SELECT total_cents, due_now_cents FROM bookings WHERE code = $1", [code]);
  expect(b.due_now_cents).toBe(Math.round(b.total_cents * 0.3));
  await expect(page.getByText(/deposit\. The remaining/)).toBeVisible();
  await signOut(page);
  await signIn(page, "marcus@demo.sevgio.com", "demo-password-2026");
  await page.goto("/host/bookings?view=upcoming");
  page.on("dialog", d => d.accept());
  const row = page.locator("tr", { hasText: code });
  await row.getByText("Mark payment received").click();
  await row.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment recorded.")).toBeVisible();
  await expect(page.locator("tr", { hasText: code })).toContainText("Deposit paid");
  await expect(page.locator("tr", { hasText: code })).toContainText("to collect");
  await signOut(page);
});

test("unpaid bookings expire at their deadline and release the dates", async ({ page }) => {
  await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
  await book(page, "rittenhouse-square-loft", 220, 222, /^Venmo/);
  const code = (await page.locator(".code").textContent())!.trim();
  await sql("UPDATE bookings SET payment_deadline = now() - interval '1 minute' WHERE code = $1", [code]);
  await page.goto("/trips");
  const [b] = await sql<{ status: string }>("SELECT status FROM bookings WHERE code = $1", [code]);
  expect(b.status).toBe("expired");
  await page.goto(`/stays?ci=${iso(220)}&co=${iso(222)}&loc=Philadelphia`);
  await expect(page.locator("a.card")).toHaveCount(1);
  await signOut(page);
});

test("Stripe webhook confirms card payments once, and bank transfers when they clear", async ({ page, request }) => {
  const stripe = new Stripe("sk_test_e2e_dummy");
  const send = async (type: string, session: Record<string, unknown>) => {
    const payload = JSON.stringify({ id: "evt_" + Math.random().toString(36).slice(2), object: "event", type, data: { object: session } });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_e2e_test" });
    return request.post("/api/stripe/webhook", { data: payload, headers: { "stripe-signature": header, "content-type": "application/json" } });
  };
  // Bad signature is refused.
  expect((await request.post("/api/stripe/webhook", { data: "{}", headers: { "stripe-signature": "t=1,v1=bad" } })).status()).toBe(400);

  const [p] = await sql<{ id: string }>("SELECT id FROM properties WHERE slug = 'mount-washington-view-house'");
  const [g] = await sql<{ id: string }>("SELECT id FROM users WHERE email = 'guest@demo.sevgio.com'");
  const mk = async (code: string, method: string, ci: number) => (await sql<{ id: string }>(
    `INSERT INTO bookings (code, property_id, guest_id, check_in, check_out, guests, adults, status, nights, nightly_price_cents, cleaning_fee_cents, tax_cents, total_cents, lodging_cents,
       guest_name, guest_phone, payment_method, card_fee_cents, due_now_cents, payment_status, payment_deadline)
     VALUES ($1, $2, $3, $4, $5, 2, 2, 'awaiting_payment', 2, 10000, 0, 0, 20000, 20000, 'Sarah Miller', '555', $6, $7, $8, 'pending', now() + interval '1 hour') RETURNING id`,
    [code, p.id, g.id, iso(ci), iso(ci + 2), method, method === "card" ? 622 : 0, method === "card" ? 20622 : 20000]))[0].id;

  const cardId = await mk("SV-CARD01", "card", 300);
  const cardSession = { id: "cs_test_card01", object: "checkout.session", payment_status: "paid", amount_total: 20622, payment_method_types: ["card"], metadata: { booking_id: cardId }, payment_intent: "pi_1" };
  expect((await send("checkout.session.completed", cardSession)).status()).toBe(200);
  expect((await send("checkout.session.completed", cardSession)).status()).toBe(200); // Stripe retries are harmless
  let [b] = await sql<{ status: string; payment_status: string; paid_cents: number }>("SELECT status, payment_status, paid_cents FROM bookings WHERE id = $1", [cardId]);
  expect(b).toEqual({ status: "confirmed", payment_status: "paid", paid_cents: 20000 });
  expect((await sql("SELECT 1 FROM payments WHERE booking_id = $1", [cardId])).length).toBe(1);

  const achId = await mk("SV-ACH001", "ach", 310);
  const achSession = { id: "cs_test_ach01", object: "checkout.session", payment_status: "unpaid", amount_total: 20000, payment_method_types: ["us_bank_account"], metadata: { booking_id: achId }, payment_intent: "pi_2" };
  await send("checkout.session.completed", achSession);
  [b] = await sql("SELECT status, payment_status, paid_cents FROM bookings WHERE id = $1", [achId]);
  expect(b).toEqual({ status: "confirmed", payment_status: "processing", paid_cents: 20000 });
  await send("checkout.session.async_payment_succeeded", { ...achSession, payment_status: "paid" });
  [b] = await sql("SELECT status, payment_status, paid_cents FROM bookings WHERE id = $1", [achId]);
  expect(b).toEqual({ status: "confirmed", payment_status: "paid", paid_cents: 20000 });

  // Turn payments back off for anything that runs later.
  await setPayments(page, {});
});

test("a listing with the owner's own Zelle shows the owner's account to guests", async ({ page }) => {
  await setPayments(page, { zelle: true, venmo: true, cash: true });
  await sql("UPDATE properties SET owner_zelle = 'owner@rittenhouse.test' WHERE slug = 'rittenhouse-square-loft'");
  try {
    await signIn(page, "guest@demo.sevgio.com", "demo-password-2026");
    await book(page, "rittenhouse-square-loft", 240, 242, /^Zelle/);
    await expect(page.getByRole("heading", { name: "Payment needed to confirm" })).toBeVisible();
    await expect(page.getByText("owner@rittenhouse.test")).toBeVisible();
    await expect(page.getByText("pay@sevgio.test")).toHaveCount(0);
    await signOut(page);
  } finally {
    await sql("UPDATE properties SET owner_zelle = '' WHERE slug = 'rittenhouse-square-loft'");
  }
});

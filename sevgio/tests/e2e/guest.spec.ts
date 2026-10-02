import { test, expect } from "@playwright/test";
import { iso, pickDates, sql, signIn, signOut } from "./helpers.ts";

test.describe.configure({ mode: "serial" });
const email = `guest-${Date.now()}@example.com`;

test("homepage shows search and property cards", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("right here in the ’Burgh");
  await expect(page.getByRole("search")).toBeVisible();
  await expect(page.locator("a.card")).toHaveCount(6);
  await expect(page.locator("a.card").first().locator("img")).toBeVisible();
  // Every card shows who hosts it.
  await expect(page.locator("a.card .card-host")).toHaveCount(6);
  await expect(page.locator("a.card", { hasText: "Jim Thorpe" }).locator(".card-host")).toHaveText(/^Hosted by \w+$/);
});

test("search form moves on by itself: Where, then check-in, check-out, guests; listing dates move on to guests", async ({ page }) => {
  await page.goto("/");
  const form = page.getByRole("search");
  await form.getByRole("combobox", { name: "Where" }).click();
  await page.getByRole("option", { name: /Poconos/ }).click();
  await expect(form.getByLabel("Check-in")).toBeFocused();
  await form.getByLabel("Check-in").fill(iso(30));
  await expect(form.getByLabel("Check-out")).toBeFocused();
  await expect(form.getByLabel("Check-out")).toHaveAttribute("min", iso(31));
  await form.getByLabel("Check-out").fill(iso(33));
  await expect(form.getByLabel("Guests")).toBeFocused();
  await form.getByLabel("Guests").selectOption("3");
  await expect(form.getByRole("button", { name: "Search stays" })).toBeFocused();
  // On a listing, picking check-out moves to who's coming.
  await page.goto("/stays/jim-thorpe-mountain-cabin");
  await pickDates(page, iso(40), iso(43));
  await expect(page.getByRole("button", { name: "More adults" })).toBeFocused();
});

test("search by area, filter, sort and empty state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Where" }).fill("Pocon");
  await page.getByRole("option", { name: /Poconos/ }).click();
  await page.getByRole("button", { name: "Search stays" }).click();
  await expect(page.getByRole("heading", { name: /2 stays in Poconos/ })).toBeVisible();
  // Quick filter buttons across the top switch a filter on and off.
  await page.getByRole("link", { name: /Hot tub/ }).click();
  await expect(page).toHaveURL(/amen=hottub/);
  await expect(page.getByRole("link", { name: /Hot tub/ })).toHaveAttribute("aria-pressed", "true");
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
  // New accounts must confirm their email with a code before they can be used. Plant a known code (the real one is emailed).
  await expect(page).toHaveURL(/\/verify\?next=%2Fbook%2Flake-harmony-lodge/);
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  // Until then, the rest of the account is locked.
  const verifyUrl = page.url();
  await page.goto("/trips");
  await expect(page).toHaveURL(/\/verify\?next=%2Ftrips/);
  await page.goto(verifyUrl);
  const crypto = await import("node:crypto");
  const [nu] = await sql<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  await sql("INSERT INTO email_codes (user_id, code_hash, expires_at) VALUES ($1, $2, now() + interval '15 minutes')", [nu.id, crypto.createHash("sha256").update(`${nu.id}:123456`).digest("hex")]);
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Confirm email" }).click();
  await expect(page.getByText(/That code isn't right/)).toBeVisible();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Confirm email" }).click();
  await expect(page).toHaveURL(/\/book\/lake-harmony-lodge/);
  await expect(page.getByRole("button", { name: /Confirm booking/ })).toBeVisible();
  await page.getByLabel("Mobile phone").fill("(570) 555-0199");
  await page.getByLabel(/Estimated arrival time/).selectOption("5:00 pm - 6:00 pm");
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: /Confirm booking/ }).click();
  await expect(page.getByText("You're booked!")).toBeVisible();
  const [arr] = await sql<{ arrival_time: string }>("SELECT arrival_time FROM bookings ORDER BY created_at DESC LIMIT 1");
  expect(arr.arrival_time).toBe("5:00 pm - 6:00 pm");
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
  // A used link explains itself and offers a new one, instead of a dead end.
  await page.goto(`/reset/${token}`);
  await expect(page.getByRole("heading", { name: "This link doesn't work anymore" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Send me a new link" })).toBeVisible();
  // A link cut short by a mail app, or with a stray character added, still lands somewhere useful.
  await page.goto("/reset");
  await expect(page.getByRole("heading", { name: "This link doesn't work anymore" })).toBeVisible();
  const token2 = "abc123def456" + Date.now();
  await sql("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '30 minutes')", [crypto.createHash("sha256").update(token2).digest("hex"), u.id]);
  await page.goto(`/reset/${token2}%E2%80%8B`);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.goto(`/reset?token=${token2}`);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
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

test("tapping a greeting switches the site language, and back", async ({ page }) => {
  await page.goto("/");
  await page.locator(".hello").getByRole("link", { name: "Hoş geldiniz" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Dünyanın her yerinden");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("link", { name: "Pittsburgh rehberi" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Konaklama ara" })).toBeVisible();
  // The header menu switches too, and remembers the page you were on.
  await page.goto("/pittsburgh");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pittsburgh rehberiniz");
  await page.locator(".lang-menu summary").click();
  await page.locator(".lang-menu").getByRole("link", { name: "Deutsch" }).click();
  await expect(page).toHaveURL(/\/pittsburgh$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ihr Pittsburgh-Guide");
  await page.goto("/");
  await page.locator(".hello").getByRole("link", { name: "Yinz are welcome!" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("right here in the ’Burgh");
  // Only site paths are allowed as the return address.
  const r = await page.request.get("/lang/fr?next=//evil.example", { maxRedirects: 0 });
  expect(r.headers()["location"]).toBe("/");
});

test("Pittsburgh guide: categories fold open and closed; places have map links", async ({ page }) => {
  await page.goto("/pittsburgh");
  // Every category starts as a tidy closed row.
  const see = page.locator("details#see");
  await expect(page.getByRole("heading", { name: "Must-see & historic Pittsburgh" })).toBeVisible();
  await expect(see).not.toHaveAttribute("open", "");
  await expect(page.getByRole("heading", { name: "Primanti Bros." })).toBeHidden();
  // Tapping a row opens it.
  await page.locator("details#eat > summary").click();
  await expect(page.getByRole("heading", { name: "Primanti Bros." })).toBeVisible();
  await expect(page.locator("details#eat a.guide-map").first()).toHaveAttribute("href", /google\.com\/maps\/dir\/\?api=1&destination=/);
  // The category buttons open their section and jump to it.
  await page.locator(".guide-toc").getByRole("link", { name: /Near our homes/ }).click();
  await expect(page.locator(".near-list a", { hasText: "Mayfly Market" })).toHaveAttribute("href", /maps\/dir\/.*Mayfly%20Market/);
  await expect(page).toHaveURL(/#near$/);
  // Open all / Close all.
  await page.getByRole("button", { name: "Open all" }).click();
  await expect(page.getByRole("link", { name: /Directions to the airport/ })).toHaveAttribute("href", /Pittsburgh%20International%20Airport/);
  await expect(page.getByText("Yinz", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close all" }).click();
  await expect(page.getByRole("heading", { name: "Primanti Bros." })).toBeHidden();
  // A link straight to a section opens it.
  await page.goto("/pittsburgh#drink");
  await expect(page.locator("details#drink")).toHaveAttribute("open", "");
});

test("a house with rooms lets guests choose the whole house or a room", async ({ page }) => {
  const [h] = await sql<{ id: string }>("SELECT id FROM properties WHERE slug = 'mount-washington-view-house'");
  const [r] = await sql<{ id: string; parent_id: string | null }>("SELECT id, parent_id FROM properties WHERE slug = 'lancaster-county-farmhouse-suite'");
  await sql("UPDATE properties SET parent_id = $1 WHERE id = $2", [h.id, r.id]);
  try {
    await page.goto(`/stays/lancaster-county-farmhouse-suite?ci=${iso(300)}&co=${iso(302)}&guests=2`);
    const chooser = page.locator(".chooser");
    await expect(chooser.getByRole("heading", { name: "How would you like to stay?" })).toBeVisible();
    await expect(chooser.locator(".chooser-opt")).toHaveCount(2);
    await expect(chooser.locator(".chooser-opt.on")).toContainText("Private room");
    await expect(chooser.locator(".chooser-opt", { hasText: "Whole house" })).toContainText("Available");
    await chooser.locator(".chooser-opt", { hasText: "Whole house" }).click();
    await expect(page).toHaveURL(/\/stays\/mount-washington-view-house\?ci=/);
    await expect(page.locator(".chooser-opt.on")).toContainText("Whole house");
  } finally {
    await sql("UPDATE properties SET parent_id = $1 WHERE id = $2", [r.parent_id, r.id]);
  }
});

test("an unconfirmed account can start over with a different email", async ({ page }) => {
  const wrong = `typo-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Typo Guest");
  await page.getByLabel("Email").fill(wrong);
  await page.getByLabel("Password").fill("guest-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  await page.getByRole("button", { name: "Wrong email? Start over" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  expect(await sql("SELECT 1 FROM users WHERE email = $1", [wrong])).toHaveLength(0);
});

test("password boxes have an eye button to show what was typed", async ({ page }) => {
  await page.goto("/signin");
  const box = page.getByLabel("Password");
  await box.fill("secret-123");
  await expect(box).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show what you typed" }).click();
  await expect(box).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide what you typed" }).click();
  await expect(box).toHaveAttribute("type", "password");
});

test("Where offers preset places; Downtown Pittsburgh finds Pittsburgh stays; up to 10 guests", async ({ page }) => {
  await page.goto("/");
  // Tapping "Where" opens suggested places right away.
  const where = page.getByRole("combobox", { name: "Where" });
  await where.click();
  for (const label of ["Anywhere", "Pittsburgh, PA", "Downtown Pittsburgh", "Indiana, PA"]) await expect(page.getByRole("option", { name: new RegExp(label) }).first()).toBeVisible();
  await expect(page.getByLabel("Guests").locator("option")).toHaveCount(10);
  await page.getByRole("option", { name: /Downtown Pittsburgh/ }).click();
  await page.getByRole("button", { name: "Search stays" }).click();
  await expect(page.locator("a.card", { hasText: "Mount Washington View House" })).toBeVisible();
  await expect(page.locator("a.card", { hasText: "Jim Thorpe" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Where" })).toHaveValue("Downtown Pittsburgh");
  // Recent searches are remembered for next time.
  await page.goto("/");
  await page.getByRole("combobox", { name: "Where" }).click();
  await expect(page.getByText("Recent searches")).toBeVisible();
});

test("sign-up asks guest or host; host requests wait for admin approval", async ({ page }) => {
  const hostEmail = `newhost-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel(/List my home/).check();
  await page.getByLabel("Full name").fill("New Host");
  await page.getByLabel("Email").fill(hostEmail);
  await page.getByLabel("Password").fill("host-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  const [nu] = await sql<{ id: string; role: string; host_requested_at: string | null }>("SELECT id, role, host_requested_at FROM users WHERE email = $1", [hostEmail]);
  expect(nu.role).toBe("customer");
  expect(nu.host_requested_at).not.toBeNull();
  await sql("UPDATE users SET email_verified_at = now() WHERE id = $1", [nu.id]);
  await page.goto("/account");
  await expect(page.getByText("Your host request is being reviewed.")).toBeVisible();
  await page.goto("/host");
  await expect(page).toHaveURL(/no-access/);
  await signOut(page);

  await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
  await page.goto("/admin");
  await expect(page.getByText(/host request/)).toBeVisible();
  await page.goto("/admin/users?role=requests");
  await page.locator("tr", { hasText: hostEmail }).getByRole("button", { name: "Approve as host" }).click();
  await expect(page.locator("tr", { hasText: hostEmail }).getByText("Wants to host")).toHaveCount(0);
  const [after] = await sql<{ role: string }>("SELECT role FROM users WHERE id = $1", [nu.id]);
  expect(after.role).toBe("host");
  await signOut(page);
  await signIn(page, hostEmail, "host-password-1");
  await page.goto("/host");
  await expect(page).toHaveURL(/\/host$/);
});

test("listing pages can be shared by email, text, WhatsApp, Facebook and more; photos can't be right-click saved", async ({ page }) => {
  await page.goto("/stays/jim-thorpe-mountain-cabin");
  await page.getByRole("button", { name: "Share" }).click();
  const menu = page.getByRole("menu", { name: "Share this place" });
  await expect(menu.getByRole("menuitem", { name: /Email/ })).toHaveAttribute("href", /^mailto:\?subject=.*stays%2Fjim-thorpe-mountain-cabin/);
  await expect(menu.getByRole("menuitem", { name: /Text message/ })).toHaveAttribute("href", /^sms:/);
  await expect(menu.getByRole("menuitem", { name: /WhatsApp/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
  await expect(menu.getByRole("menuitem", { name: /Facebook/ })).toHaveAttribute("href", /facebook\.com\/sharer/);
  await expect(menu.getByRole("menuitem", { name: /Instagram/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Copy link/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  // Right-clicking a photo doesn't open the browser's "Save image" menu.
  const blocked = await page.evaluate(() => {
    const img = document.querySelector("img")!;
    const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    img.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(blocked).toBe(true);
});

test("listing shows views, favourites, interested and shares; Save and I'm interested switch on and off", async ({ page, browser }) => {
  await sql("DELETE FROM listing_activity WHERE property_id = (SELECT id FROM properties WHERE slug = 'jim-thorpe-mountain-cabin')");
  await page.goto("/stays/jim-thorpe-mountain-cabin");
  const stats = page.getByRole("list", { name: "Listing activity" });
  await expect(stats).toContainText("1 view");
  await expect(stats).toContainText("0 times saved as favourite");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(stats).toContainText("1 time saved as favourite");
  await expect(page.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "I'm interested" }).click();
  await expect(stats).toContainText("1 interested");
  await page.getByRole("button", { name: "Share" }).click();
  await page.getByRole("menuitem", { name: /Copy link/ }).click();
  await expect(stats).toContainText("1 time shared");
  // Coming back the same day isn't another view, and the choices are remembered.
  await page.reload();
  await expect(stats).toContainText("1 view");
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  await page.getByRole("button", { name: "Saved" }).click();
  await expect(stats).toContainText("0 times saved as favourite");
  // A different visitor adds a view.
  const other = await browser.newPage();
  await other.goto("/stays/jim-thorpe-mountain-cabin");
  await expect(other.getByRole("list", { name: "Listing activity" })).toContainText("2 views");
  await other.close();
});

test("public pages can't be copied: no right-click, no copy, no save/print shortcuts; copier programs are refused", async ({ page, request }) => {
  await page.goto("/stays/jim-thorpe-mountain-cabin");
  await expect(page.locator("html")).toHaveAttribute("data-protect", "on");
  const r = await page.evaluate(() => {
    const fire = (type: string, target: EventTarget, init: object = {}) => {
      const e = type === "keydown" ? new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }) : type === "copy" ? new ClipboardEvent(type, { bubbles: true, cancelable: true }) : new MouseEvent(type, { bubbles: true, cancelable: true });
      target.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const h1 = document.querySelector("h1")!;
    return { menu: fire("contextmenu", h1), copy: fire("copy", h1), save: fire("keydown", document, { key: "s", ctrlKey: true }), source: fire("keydown", document, { key: "u", ctrlKey: true }), print: fire("keydown", document, { key: "p", metaKey: true }),
      select: getComputedStyle(document.body).userSelect };
  });
  expect(r).toEqual({ menu: true, copy: true, save: true, source: true, print: true, select: "none" });
  await expect(page.getByText(/All rights reserved/)).toBeVisible();
  // Website-copying programs get turned away; search engines and normal browsers don't.
  expect((await request.get("/", { headers: { "User-Agent": "Mozilla/4.5 (compatible; HTTrack 3.0x; Windows 98)" } })).status()).toBe(403);
  expect((await request.get("/", { headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } })).status()).toBe(200);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("GPTBot");
});

test("search results: map with a price pin for each stay, filters panel, entire home / private room", async ({ page }) => {
  await sql("UPDATE properties SET lat = 40.44 + (random() - 0.5) * 0.05, lng = -79.99 + (random() - 0.5) * 0.08 WHERE status = 'published' AND city = 'Pittsburgh'");
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/stays?loc=Pittsburgh");
  const map = page.getByRole("region", { name: "Map of stays" });
  await expect(map.locator(".map-pin").first()).toBeVisible();
  const cards = await page.locator("a.card").count();
  await expect(map.locator(".map-pin")).toHaveCount(cards);
  // Hovering a stay lights up its pin; tapping a pin shows the stay.
  await page.locator("a.card").first().hover();
  await expect(map.locator(".map-pin.hot")).toHaveCount(1);
  await map.locator(".map-pin").first().click();
  await expect(page.locator(".map-card")).toBeVisible();
  // All filters in one panel.
  await page.getByRole("button", { name: /^Filters/ }).click();
  const panel = page.getByRole("dialog", { name: "Filters" });
  await panel.getByText("Entire home", { exact: true }).click();
  await panel.getByRole("button", { name: "Show stays" }).click();
  await expect(page).toHaveURL(/kind=home/);
  const homes = await page.locator("a.card").count();
  expect(homes).toBeGreaterThan(0);
  expect(homes).toBeLessThanOrEqual(cards);
  await expect(page.getByRole("button", { name: /Filters \(1\)/ })).toBeVisible();
});

test("phones: a Menu button opens every link as a big row (no sideways-scrolling strip)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/pittsburgh");
  await expect(page.locator("nav.main")).toBeHidden();
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toBeVisible();
  await menu.click();
  const panel = page.getByRole("navigation", { name: "Menu" });
  for (const name of ["Stays", "Events", "Pittsburgh guide", "Contact", "Sign in", "Create account"]) await expect(panel.getByRole("link", { name })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Pittsburgh guide" })).toHaveAttribute("aria-current", "page");
  await panel.getByRole("link", { name: "Events" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(panel).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await ctx.close();
});

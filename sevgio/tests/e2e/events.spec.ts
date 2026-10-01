import { test, expect } from "@playwright/test";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { iso, signIn, signOut, sql } from "./helpers.ts";

test.describe.configure({ mode: "serial" });

// A pretend Ticketmaster Discovery API (the app points at it through TICKETMASTER_BASE in the test setup).
function fakeTicketmaster() {
  const ev = (id: string, name: string, day: number, time: string, venue: string, segment: string) => ({
    id, name, url: `https://www.ticketmaster.com/event/${id}`, images: [{ url: `https://s1.ticketm.net/${id}.jpg`, width: 1024, ratio: "16_9" }],
    dates: { start: { localDate: iso(day), localTime: time } }, classifications: [{ segment: { name: segment }, genre: { name: "x" } }], _embedded: { venues: [{ name: venue }] },
  });
  const body = JSON.stringify({ page: { totalPages: 1 }, _embedded: { events: [
    ev("tm-steelers", "Pittsburgh Steelers vs. Baltimore Ravens", 2, "13:00:00", "Acrisure Stadium", "Sports"),
    ev("tm-pens", "Pittsburgh Penguins vs. Montreal Canadiens", 3, "19:00:00", "PPG Paints Arena", "Sports"),
    ev("tm-parking", "Steelers vs Ravens Parking (NOT A GAME TICKET)", 2, "13:00:00", "Acrisure Stadium", "Sports"),
    ev("tm-concert", "Rod Wave", 4, "20:00:00", "PPG Paints Arena", "Music"),
  ] } });
  const seen: string[] = [];
  const server = http.createServer((req, res) => { seen.push(req.url || ""); res.setHeader("Content-Type", "application/json"); res.end(body); });
  return { server, seen, start: () => new Promise<void>(r => server.listen(3199, r)), stop: () => new Promise<void>(r => server.close(() => r())) };
}

test("events page: Ticketmaster games and concerts, admin-added events, day/week/month and team filters", async ({ page }) => {
  const tm = fakeTicketmaster();
  await tm.start();
  try {
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto("/admin/events");
    await expect(page.getByText(/Ticketmaster is connected/)).toBeVisible();
    await page.getByRole("button", { name: "Update events now" }).click();
    await expect(page.getByText(/Updated: 3 events from Ticketmaster/)).toBeVisible();
    expect(tm.seen[0]).toContain("apikey=e2e-key");
    expect(tm.seen[0]).toContain("latlong=40.4406");
    // Parking passes aren't events.
    expect(await sql("SELECT 1 FROM events WHERE source_id = 'tm-parking'")).toHaveLength(0);

    // Add a local multi-day festival with a flyer.
    const f = path.join(process.cwd(), "test-results", "flyer.png");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const sharp = (await import("sharp")).default;
    await sharp({ create: { width: 1200, height: 675, channels: 3, background: "#C47A00" } }).png().toFile(f);
    await page.getByLabel("Event name").fill("Prostburgh! Oktoberfest");
    await page.getByLabel("Date (first day)").fill(iso(1));
    await page.getByLabel(/Last day/).fill(iso(5));
    await page.getByLabel(/Start time/).fill("12:00");
    await page.getByLabel("Place").fill("Market Square");
    await page.getByLabel("Type of event").first().selectOption("Festivals");
    await page.getByLabel("Picture (optional)").setInputFiles(f);
    await page.getByLabel("Featured").check();
    await page.getByLabel("Free").check();
    await page.getByRole("button", { name: "Add event" }).click();
    await expect(page.getByText('Added "Prostburgh! Oktoberfest".')).toBeVisible();
    await signOut(page);

    // Guests: the week shows everything, with dates, places, tags and ticket links.
    await page.goto("/events");
    const steelers = page.locator(".event-card", { hasText: "Pittsburgh Steelers vs. Baltimore Ravens" });
    await expect(steelers).toHaveAttribute("href", "https://www.ticketmaster.com/event/tm-steelers");
    await expect(steelers).toContainText("Acrisure Stadium");
    await expect(steelers.locator(".event-date")).toContainText("1 PM");
    await expect(page.locator(".event-card", { hasText: "Rod Wave" })).toBeVisible();
    const fest = page.locator(".event-card", { hasText: "Prostburgh! Oktoberfest" });
    await expect(fest.locator(".event-tags")).toContainText("Featured");
    await expect(fest.locator(".event-tags")).toContainText("Free");
    await expect(fest.getByText("See all dates")).toBeVisible();
    await expect(fest.locator("img")).toHaveAttribute("src", /\/api\/site-photos\//);

    // Team filter shows only that team.
    await page.locator(".guide-toc").getByRole("link", { name: /Penguins/ }).click();
    await expect(page.locator(".event-card")).toHaveCount(1);
    await expect(page.locator(".event-card")).toContainText("Montreal Canadiens");

    // Day view: only that day's events (the festival runs across it).
    await page.goto(`/events?view=day&start=${iso(2)}`);
    await expect(page.locator(".event-card", { hasText: "Steelers" })).toBeVisible();
    await expect(page.locator(".event-card", { hasText: "Prostburgh" })).toBeVisible();
    await expect(page.locator(".event-card", { hasText: "Rod Wave" })).toHaveCount(0);

    // Month view lists them too; the menu links to the page.
    await page.getByRole("link", { name: "Month", exact: true }).click();
    await expect(page).toHaveURL(/view=month/);
    await expect(page.getByRole("link", { name: "Events" }).first()).toBeVisible();

    // Admins can hide an event.
    await signIn(page, "admin@demo.sevgio.com", "admin-password-2026");
    await page.goto("/admin/events");
    await page.locator("tr", { hasText: "Rod Wave" }).getByRole("button", { name: "Hide" }).click();
    await expect(page.locator("tr", { hasText: "Rod Wave" }).getByRole("button", { name: "Show" })).toBeVisible();
    await page.goto("/events");
    await expect(page.locator(".event-card", { hasText: "Rod Wave" })).toHaveCount(0);
    await signOut(page);
  } finally {
    await tm.stop();
  }
});

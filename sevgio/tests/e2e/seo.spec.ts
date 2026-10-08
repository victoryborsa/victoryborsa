import { test, expect } from "@playwright/test";

// What search engines see: who may crawl, one address per page, no private pages, a sitemap of real pages, and accurate structured data.

test("robots.txt: search engines (Google, Bing, ChatGPT search) may crawl public pages and photos; private areas and AI training crawlers are kept out", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  const group = (agent: string) => robots.split(/\n\n+/).find(g => g.split("\n").some(l => l.trim() === `User-Agent: ${agent}`)) || "";
  for (const agent of ["*", "Googlebot", "OAI-SearchBot"]) {
    const g = group(agent);
    expect(g, agent).toContain("Allow: /api/photos/");
    expect(g, agent).toContain("Disallow: /admin");
    expect(g, agent).toContain("Disallow: /host/");
    expect(g, agent).not.toMatch(/Disallow: \/host\n/); // would also block /host-terms
    expect(g, agent).not.toMatch(/Disallow: \/\n/);
  }
  expect(group("GPTBot")).toMatch(/Disallow: \/\n?$/m);
  expect(robots).toMatch(/Sitemap: http.*\/sitemap\.xml/);
});

test("private pages say noindex in the response header; public pages don't", async ({ request }) => {
  for (const path of ["/admin", "/host", "/trips", "/account", "/signin", "/forgot"]) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.headers()["x-robots-tag"], path).toBe("noindex");
  }
  for (const path of ["/", "/stays", "/host-terms", "/stays/jim-thorpe-mountain-cabin"]) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(200);
    expect(r.headers()["x-robots-tag"], path).toBeUndefined();
    expect(await r.text(), path).not.toContain('name="robots" content="noindex');
  }
});

test("old website addresses go to the new page in one permanent redirect; missing pages are a real 404", async ({ request }) => {
  for (const [from, to] of [["/login", "/signin"], ["/contact-us", "/contact"], ["/terms-of-service", "/terms"], ["/property/12345", "/stays"], ["/become-host", "/signup?host=1"]]) {
    const r = await request.get(from, { maxRedirects: 0 });
    expect(r.status(), from).toBe(301);
    const to2 = new URL(r.headers().location, "http://x");
    expect(to2.pathname + to2.search, from).toBe(to);
  }
  expect((await request.get("/no-such-page")).status()).toBe(404);
  expect((await request.get("/stays/no-such-stay")).status()).toBe(404);
});

test("sitemap lists only public pages that load, each the page's own canonical address", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname);
  expect(urls).toContain("/stays/jim-thorpe-mountain-cabin");
  expect(urls.some(u => /^\/(admin|host\/|trips|account|book|signin|signup)/.test(u))).toBe(false);
  for (const path of urls) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(200);
    const html = await r.text();
    expect(html, path).not.toContain('content="noindex');
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    expect(canonical && new URL(canonical).pathname, path).toBe(path);
  }
});

test("filtered search addresses point search engines at the main stays page", async ({ request }) => {
  const html = await (await request.get("/stays?kind=room&monthly=1")).text();
  expect(new URL(html.match(/<link rel="canonical" href="([^"]+)"/)![1]).pathname).toBe("/stays");
});

test("listing page: breadcrumb trail on the page and in structured data, no ratings in structured data", async ({ page, request }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/stays/jim-thorpe-mountain-cabin");
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  await expect(crumbs.getByRole("link", { name: "Stays" })).toHaveAttribute("href", "/stays");
  await expect(crumbs.locator("[aria-current=page]")).toHaveText("Jim Thorpe Mountain Cabin");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).map(t => JSON.parse(t));
  const trail = ld.find(d => d["@type"] === "BreadcrumbList");
  expect(trail.itemListElement.map((i: { name: string }) => i.name)).toEqual(["Home", "Stays", "Jim Thorpe Mountain Cabin"]);
  const home = ld.find(d => d.offers);
  expect(home.name).toBe("Jim Thorpe Mountain Cabin");
  expect(home.aggregateRating).toBeUndefined();
  // The homepage names the site.
  const homeHtml = await (await request.get("/")).text();
  expect(homeHtml).toContain('"@type":"WebSite","name":"Sevgio"');
});

test("listing photo: phones get a 1000px copy, computers the large one", async ({ page, request }) => {
  await page.goto("/stays/jim-thorpe-mountain-cabin");
  const first = page.locator(".gallery .g0 img");
  await expect(first).toHaveAttribute("srcset", /s=medium 1000w, .*s=large 1800w/);
  const src = (await first.getAttribute("src"))!;
  const medium = await request.get(src.replace("s=large", "s=medium"));
  expect(medium.status()).toBe(200);
  expect(medium.headers()["content-type"]).toBe("image/webp");
});

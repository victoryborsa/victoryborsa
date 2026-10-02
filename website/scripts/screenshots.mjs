// Takes desktop and phone screenshots of the built site (run "npm run build" first).
// Usage: node scripts/screenshots.mjs [outDir]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(join(process.execPath, "../../lib/node_modules/playwright")));
}

const dist = new URL("../dist/", import.meta.url).pathname;
const out = process.argv[2] || new URL("../screenshots/", import.meta.url).pathname;
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = join(dist, path.endsWith("/") ? path + "index.html" : path);
  try {
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
const shots = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "phone", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
];
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: s.viewport, isMobile: s.isMobile, hasTouch: s.hasTouch, deviceScaleFactor: s.deviceScaleFactor || 1 });
  const page = await ctx.newPage();
  for (const p of ["index.html", "book.html"]) {
    await page.goto(`${base}/${p}`, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: ".reveal{opacity:1!important;transform:none!important;transition:none!important}" });
    await page.evaluate(() => document.fonts.ready);
    const stem = p.replace(".html", "");
    await page.screenshot({ path: join(out, `${stem}-${s.name}.png`) });
    await page.screenshot({ path: join(out, `${stem}-${s.name}-full.png`), fullPage: true });
  }
  await ctx.close();
}
await browser.close();
server.close();
console.log("Screenshots saved to", out);

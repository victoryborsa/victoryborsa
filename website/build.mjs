// Builds the site into dist/ as plain static files, ready to upload to GoDaddy.
//
// Each file in src/pages is the main content of one page. It starts with a
// comment holding the page's settings, for example:
//   <!--page {"path": "/services", "title": "...", "description": "..."} -->
// The build wraps it in src/partials/layout.html (head, header, footer) and
// writes it to the same web address as the current site, e.g. /services
// becomes dist/services/index.html. Pages can also pull in shared pieces with
// <!-- @include name -->, which inserts src/partials/name.html.
//
// Links are written as site-root paths ("/services"). `node build.mjs --preview`
// rewrites them to relative file links so the site can be browsed without a
// web server (used for the shareable preview).
//
// Prices, the travel fee, discounts, hours and the service radius all come from
// one file, ../shinepro-backoffice/public/pricing.js (shared with the back
// office). Pages never type a price; they write a token that the build fills in:
//   {{price deep 2}}  -> $309      {{from deep}}      -> $249 (lowest size)
//   {{addon fridge}}  -> $35       {{addon organizing}} -> $50/hr
//   {{off weekly}}    -> 15%       {{travel}}         -> $20
//   {{biz hours}}     -> Mon–Sat, 8am–6pm   (any field of PRICING.business)
// The same file is copied to /assets/js/pricing.js for the forms and calculators.
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

const root = new URL(".", import.meta.url).pathname;
const src = join(root, "src");
const preview = process.argv.includes("--preview");
const dist = join(root, preview ? "dist-preview" : "dist");
const site = "https://pghshinepro.com";

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(src, "public"), dist, { recursive: true });

const pricingFile = join(root, "..", "shinepro-backoffice", "public", "pricing.js");
const { PRICING, money } = createRequire(import.meta.url)(pricingFile);
cpSync(pricingFile, join(dist, "assets", "js", "pricing.js"));

function token(kind, args, from) {
  const fail = () => {
    throw new Error(`${from}: unknown price token {{${[kind, ...args].join(" ")}}}`);
  };
  if (kind === "travel") return money(PRICING.travelFee);
  if (kind === "price" || kind === "from") {
    const s = PRICING.services[args[0]];
    if (!s || !s.prices) fail();
    const p = kind === "from" ? Math.min(...s.prices.filter((x) => x != null)) : s.prices[Number(args[1]) - 1];
    if (p == null) fail();
    return money(p);
  }
  if (kind === "addon") {
    const a = PRICING.addons.find((x) => x.id === args[0]);
    if (!a) fail();
    return money(a.price) + (a.perHour ? "/hr" : "");
  }
  if (kind === "off") {
    const f = PRICING.frequency[args[0]];
    if (!f) fail();
    return Math.round(f.discount * 100) + "%";
  }
  if (kind === "biz") {
    if (!(args[0] in PRICING.business)) fail();
    return String(PRICING.business[args[0]]);
  }
  fail();
}

function fillPrices(html, from) {
  return html.replace(/\{\{(price|from|addon|off|travel|biz)((?:\s+[\w-]+)*)\s*\}\}/g, (_, kind, rest) =>
    token(kind, rest.trim() ? rest.trim().split(/\s+/) : [], from)
  );
}

const partials = {};
for (const file of readdirSync(join(src, "partials"))) {
  partials[file.replace(/\.html$/, "")] = readFileSync(join(src, "partials", file), "utf8").trim();
}

function include(html, from) {
  return html.replace(/<!--\s*@include\s+([\w-]+)\s*-->/g, (_, name) => {
    if (!(name in partials)) throw new Error(`${from}: unknown include "${name}"`);
    return include(partials[name], name);
  });
}

function outFile(path) {
  if (path === "/") return "index.html";
  if (path.endsWith(".html")) return path.slice(1);
  return path.slice(1) + "/index.html";
}

// Turns "/services?x#y" into a link relative to the page at `fromPath`.
function relativeLink(target, fromFile) {
  const m = target.match(/^([^?#]*)(.*)$/);
  let path = m[1] || "/";
  const rest = m[2];
  let file;
  if (/\.[a-z0-9]+$/i.test(path)) file = path.slice(1);
  else file = outFile(path.replace(/\/$/, "") || "/");
  const depth = fromFile.split("/").length - 1;
  return "../".repeat(depth) + file + rest;
}

const pages = [];
for (const file of readdirSync(join(src, "pages")).filter((f) => f.endsWith(".html"))) {
  const raw = readFileSync(join(src, "pages", file), "utf8");
  const m = raw.match(/^<!--page\s+(\{[\s\S]*?\})\s*-->/);
  if (!m) throw new Error(`${file}: missing <!--page {...} --> settings`);
  const meta = JSON.parse(fillPrices(m[1], file));
  const body = raw.slice(m[0].length);
  pages.push({ file, meta, body });
}

// Photos still served by the old Airo site use the local copy once
// scripts/fetch-airo-images.mjs has saved it (any image extension).
const localPhotos = {};
const photoDir = join(src, "public", "assets", "img", "site");
if (existsSync(photoDir)) {
  for (const f of readdirSync(photoDir, { recursive: true })) {
    const m = String(f).match(/^(.*)\.(jpe?g|png|webp|avif|gif|svg)$/);
    if (m) localPhotos[m[1].split("\\").join("/")] = "/assets/img/site/" + String(f).split("\\").join("/");
  }
}
const usePhotos = (html) =>
  html.replace(/https:\/\/pghshinepro\.com\/airo-assets\/([^"')\s]+)/g, (url, p) => localPhotos[p] || url);

// A "back" link at the top of every page except the home page. It goes back
// one step when the visitor came from this site, otherwise to the parent page.
const SERVICE_PAGES = ["/house-cleaning", "/deep-cleaning", "/move-in-out-cleaning", "/airbnb-cleaning", "/apartment-condo-cleaning",
  "/event-cleanup", "/commercial-cleaning", "/post-construction-cleaning", "/upholstery-cleaning", "/eco-friendly-cleaning", "/special-event-cleaning"];
function backbar(path) {
  if (path === "/" || path === "/404") return "";
  const [href, label] = path.startsWith("/cleaning-services/") ? ["/service-areas", "Service areas"]
    : SERVICE_PAGES.includes(path) ? ["/services", "All services"] : ["/", "Home"];
  return `<nav class="backbar" aria-label="Back"><div class="wrap"><a href="${href}" data-back><svg class="icon icon-sm" aria-hidden="true"><use href="#i-arrow" /></svg><span>Back</span></a><a class="backbar-parent" href="${href}">${label}</a></div></nav>`;
}

for (const { file, meta, body } of pages) {
  const target = outFile(meta.path);
  const vars = {
    title: meta.title,
    description: meta.description || "",
    canonical: site + (meta.path === "/" ? "/" : meta.path),
    bodyClass: meta.bodyClass || "",
    backbar: backbar(meta.path),
    robots: meta.noindex ? '<meta name="robots" content="noindex" />' : "",
    head: meta.head || "",
    scripts: (meta.scripts || []).map((s) => `<script src="/assets/js/${s}"></script>`).join("\n  "),
    content: usePhotos(fillPrices(include(body, file), file))
  };
  let html = fillPrices(include(partials.layout, "layout"), "layout").replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`layout: unknown variable ${k}`);
    return vars[k];
  });
  if (meta.redirect) {
    html = `<!doctype html><meta charset="utf-8"><title>${meta.title}</title><link rel="canonical" href="${site}${meta.redirect}"><meta http-equiv="refresh" content="0; url=${meta.redirect}"><a href="${meta.redirect}">Continue</a>`;
  }
  if (preview) {
    html = html.replace(/(href|src|action)="(\/(?!\/)[^"]*)"/g, (_, attr, link) => `${attr}="${relativeLink(link, target)}"`);
    html = html.replace(/url=(\/[^"]*)"/g, (_, link) => `url=${relativeLink(link, target)}"`);
  }
  mkdirSync(dirname(join(dist, target)), { recursive: true });
  writeFileSync(join(dist, target), html);
}

const today = new Date().toISOString().slice(0, 10);
const urls = pages
  .filter((p) => !p.meta.noindex && !p.meta.redirect)
  .map((p) => `  <url><loc>${site}${p.meta.path}</loc><lastmod>${today}</lastmod></url>`)
  .join("\n");
writeFileSync(
  join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
);

if (!existsSync(join(dist, "index.html"))) throw new Error("index.html missing from build");
if (!preview) {
  const zip = join(root, "pghshinepro-website.zip");
  rmSync(zip, { force: true });
  try {
    execFileSync("zip", ["-qr", zip, "."], { cwd: dist });
    console.log(`Built ${pages.length} pages into dist/ and packed pghshinepro-website.zip`);
  } catch {
    console.log(`Built ${pages.length} pages into dist/ (install "zip" to also get a .zip for upload)`);
  }
} else {
  console.log(`Built ${pages.length} pages into dist-preview/`);
}

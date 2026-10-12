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
  const meta = JSON.parse(m[1]);
  const body = raw.slice(m[0].length);
  pages.push({ file, meta, body });
}

for (const { file, meta, body } of pages) {
  const target = outFile(meta.path);
  const vars = {
    title: meta.title,
    description: meta.description || "",
    canonical: site + (meta.path === "/" ? "/" : meta.path),
    bodyClass: meta.bodyClass || "",
    robots: meta.noindex ? '<meta name="robots" content="noindex" />' : "",
    head: meta.head || "",
    scripts: (meta.scripts || []).map((s) => `<script src="/assets/js/${s}"></script>`).join("\n  "),
    content: include(body, file)
  };
  let html = include(partials.layout, "layout").replace(/\{\{(\w+)\}\}/g, (_, k) => {
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

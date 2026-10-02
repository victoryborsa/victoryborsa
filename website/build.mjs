// Builds the site into dist/ as plain static files, ready to upload to GoDaddy.
// Pages in src/pages can pull in shared pieces with <!-- @include name -->,
// which inserts src/partials/name.html. Everything in src/public is copied as is.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = new URL(".", import.meta.url).pathname;
const src = join(root, "src");
const dist = join(root, "dist");
const site = "https://pghshinepro.com";

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(src, "public"), dist, { recursive: true });

const partials = {};
for (const file of readdirSync(join(src, "partials"))) {
  partials[file.replace(/\.html$/, "")] = readFileSync(join(src, "partials", file), "utf8").trim();
}

const pages = readdirSync(join(src, "pages")).filter((f) => f.endsWith(".html"));
for (const page of pages) {
  const html = readFileSync(join(src, "pages", page), "utf8").replace(
    /<!--\s*@include\s+([\w-]+)\s*-->/g,
    (_, name) => {
      if (!(name in partials)) throw new Error(`${page}: unknown include "${name}"`);
      return partials[name];
    }
  );
  writeFileSync(join(dist, page), html);
}

const today = new Date().toISOString().slice(0, 10);
const urls = pages
  .filter((p) => p !== "404.html")
  .map((p) => `  <url><loc>${site}/${p === "index.html" ? "" : p}</loc><lastmod>${today}</lastmod></url>`)
  .join("\n");
writeFileSync(
  join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
);

const zip = join(root, "pghshinepro-website.zip");
rmSync(zip, { force: true });
try {
  execFileSync("zip", ["-qr", zip, "."], { cwd: dist });
  console.log(`Built ${pages.length} pages into dist/ and packed ${zip}`);
} catch {
  console.log(`Built ${pages.length} pages into dist/ (install "zip" to also get a .zip for upload)`);
}
if (!existsSync(join(dist, "index.html"))) throw new Error("index.html missing from build");

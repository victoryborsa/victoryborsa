// Copies the photos the site still loads from the Airo site (pghshinepro.com/airo-assets/...)
// into src/public/assets/img/site/, so the site keeps its photos after Airo is cancelled.
// Run once while the Airo site is still live:  node scripts/fetch-airo-images.mjs
// The build then uses the local copy for every photo it finds there.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "src/public/assets/img/site");
const files = [...readdirSync(join(root, "src/pages")).map((f) => join(root, "src/pages", f)), join(root, "scripts/neighborhood-pages.mjs")];
const paths = new Set();
for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/https:\/\/pghshinepro\.com\/airo-assets\/([^"')\s]+)/g)) paths.add(m[1]);

const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/avif": ".avif", "image/gif": ".gif", "image/svg+xml": ".svg" };
let ok = 0;
for (const p of paths) {
  try {
    const res = await fetch("https://pghshinepro.com/airo-assets/" + p, { redirect: "follow" });
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!res.ok || !ext[type]) throw new Error(`${res.status} ${type}`);
    const file = join(out, p + ext[type]);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    ok++;
    console.log("saved", p + ext[type]);
  } catch (err) {
    console.log("FAILED", p, err.message);
  }
}
console.log(`${ok} of ${paths.size} photos saved to src/public/assets/img/site/`);

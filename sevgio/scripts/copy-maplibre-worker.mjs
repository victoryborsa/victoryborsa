// The search map (MapLibre 6) draws in a background worker that loads as its own file.
// Copy it into public/ so the site serves it at /maplibre/. Runs after every npm install (also on Render).
import fs from "node:fs";
import path from "node:path";
const src = path.join(process.cwd(), "node_modules", "maplibre-gl", "dist");
const out = path.join(process.cwd(), "public", "maplibre");
fs.mkdirSync(out, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) fs.copyFileSync(path.join(src, f), path.join(out, f));
console.log("MapLibre worker copied to public/maplibre");

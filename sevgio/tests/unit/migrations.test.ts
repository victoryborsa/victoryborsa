import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FLAGS, envOverride } from "../../lib/flag-list.ts";

const dir = path.join(import.meta.dirname, "..", "..", "migrations");

test("every migration from 040 on has a rollback file", () => {
  const ups = fs.readdirSync(dir).filter(f => f.endsWith(".sql") && Number(f.slice(0, 3)) >= 40);
  const downs = new Set(fs.readdirSync(path.join(dir, "down")));
  const missing = ups.filter(f => !downs.has(f.replace(/\.sql$/, ".down.sql")));
  assert.deepEqual(missing, [], "add migrations/down/<name>.down.sql for each new migration");
});

test("rollback files match a migration", () => {
  const ups = new Set(fs.readdirSync(dir));
  for (const f of fs.readdirSync(path.join(dir, "down")).filter(f => f.endsWith(".down.sql")))
    assert.ok(ups.has(f.replace(/\.down\.sql$/, ".sql")), `${f} has no migration`);
});

test("feature switches have unique FEATURE_ names", () => {
  const keys = FLAGS.map(f => f.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.match(k, /^FEATURE_[A-Z0-9_]+$/);
});

test("Render override reads on/off words and ignores anything else", () => {
  assert.equal(envOverride("on"), true);
  assert.equal(envOverride(" TRUE "), true);
  assert.equal(envOverride("off"), false);
  assert.equal(envOverride("0"), false);
  assert.equal(envOverride(""), null);
  assert.equal(envOverride(undefined), null);
  assert.equal(envOverride("maybe"), null);
});

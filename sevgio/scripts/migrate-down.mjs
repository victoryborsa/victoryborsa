// Rolls back the newest applied migration using its file in migrations/down. Emergency use only: take a backup first.
// Usage: DATABASE_URL=... npm run migrate:down -- 041_import_history.sql
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
const version = process.argv[2];
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
if (!version || !/^\d{3}_[\w-]+\.sql$/.test(version)) { console.error("Name the migration to roll back, e.g. 041_import_history.sql"); process.exit(1); }
const file = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "migrations", "down", version.replace(/\.sql$/, ".down.sql"));
if (!fs.existsSync(file)) { console.error("No rollback file:", file); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(727274)");
  const newest = (await client.query("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1")).rows[0]?.version;
  if (newest !== version) { console.error(`Only the newest migration can be rolled back. The newest applied one is ${newest}.`); process.exit(1); }
  console.log("Rolling back", version);
  await client.query("BEGIN");
  try {
    await client.query(fs.readFileSync(file, "utf8"));
    await client.query("DELETE FROM schema_migrations WHERE version = $1", [version]);
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  console.log("Rolled back. Run `npm run migrate` to apply it again.");
} finally {
  await client.end();
}

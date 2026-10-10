// Applies any SQL files in /migrations that haven't run yet. Safe to run on every deploy.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
// SSL is controlled by the connection string (e.g. ?sslmode=require for Neon).
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  await client.query("SELECT pg_advisory_lock(727274)");
  const done = new Set((await client.query("SELECT version FROM schema_migrations")).rows.map(r => r.version));
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "migrations");
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    console.log("Applying", file);
    await client.query("BEGIN");
    try {
      await client.query(fs.readFileSync(path.join(dir, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
  }
  console.log("Database is up to date.");
} finally {
  await client.end();
}


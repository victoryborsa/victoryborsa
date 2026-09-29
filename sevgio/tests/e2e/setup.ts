import { execSync } from "node:child_process";
import pg from "pg";

export default async function setup() {
  const url = process.env.E2E_DATABASE_URL || "postgres://sevgio:sevgio@localhost:5432/sevgio_test";
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await c.end();
  const env = { ...process.env, DATABASE_URL: url };
  execSync("node scripts/migrate.mjs", { env, stdio: "inherit" });
  execSync("node scripts/seed-demo.mjs", { env, stdio: "inherit" });
  execSync('node scripts/create-admin.mjs "Test Admin" admin@demo.sevgio.com "admin-password-2026"', { env, stdio: "inherit" });
}

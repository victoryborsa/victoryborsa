// Runs before the website starts on the host (e.g. Render). Safe to run on every start:
// 1. Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME, only if no admin exists yet.
// 2. If SEED_DEMO=1 and there are no listings yet, adds the six sample Pennsylvania listings
//    (their accounts get a random password nobody knows, so they can't be signed into on a live site).
// 3. If REMOVE_DEMO=1, deletes the sample listings and accounts.
import pg from "pg";
import bcrypt from "bcryptjs";
import { execSync } from "node:child_process";
import crypto from "node:crypto";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  // Trim like the sign-in form does, so a stray space pasted into the host's settings can't lock the admin out.
  const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim();
  const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || "").trim();
  const ADMIN_NAME = (process.env.ADMIN_NAME || "").trim();
  const admins = (await client.query("SELECT count(*)::int AS n FROM users WHERE role = 'admin'")).rows[0].n;
  if (admins === 0) {
    if (ADMIN_EMAIL && ADMIN_PASSWORD && ADMIN_PASSWORD.length >= 10) {
      await client.query(
        `INSERT INTO users (email, name, password_hash, role, email_verified_at) VALUES (lower($1), $2, $3, 'admin', now())
         ON CONFLICT ((lower(email))) DO UPDATE SET role = 'admin', password_hash = EXCLUDED.password_hash`,
        [ADMIN_EMAIL, ADMIN_NAME || "Sevgio Admin", await bcrypt.hash(ADMIN_PASSWORD, 12)],
      );
      console.log(`Admin account created for ${ADMIN_EMAIL}.`);
    } else {
      console.log("No admin yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ characters) to create one.");
    }
  }
  const listings = (await client.query("SELECT count(*)::int AS n FROM properties")).rows[0].n;
  if (process.env.REMOVE_DEMO === "1") execSync("node scripts/seed-demo.mjs --remove", { stdio: "inherit" });
  else if (process.env.SEED_DEMO === "1" && listings === 0)
    execSync("node scripts/seed-demo.mjs", { stdio: "inherit", env: { ...process.env, DEMO_PASSWORD: crypto.randomBytes(24).toString("hex") } });
} finally {
  await client.end();
}

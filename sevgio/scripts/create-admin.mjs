// Creates the first administrator, or resets an existing account to admin with a new password.
// Usage: npm run create-admin -- "Your Name" you@example.com "a-strong-password"
import pg from "pg";
import bcrypt from "bcryptjs";

const [name, email, password] = process.argv.slice(2).map(a => (a || "").trim());
if (!name || !email || !password || password.length < 10) {
  console.error('Usage: npm run create-admin -- "Full Name" email@example.com "password (10+ characters)"');
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const hash = await bcrypt.hash(password, 12);
const r = await client.query(
  `INSERT INTO users (email, name, password_hash, role, email_verified_at) VALUES (lower($1), $2, $3, 'admin', now())
   ON CONFLICT ((lower(email))) DO UPDATE SET role = 'admin', password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, disabled = false, email_verified_at = coalesce(users.email_verified_at, now())
   RETURNING id`,
  [email, name, hash],
);
await client.query("DELETE FROM sessions WHERE user_id = $1", [r.rows[0].id]);
console.log(`Admin ready: ${email}. Sign in at /signin`);
await client.end();

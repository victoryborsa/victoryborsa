const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  zip TEXT,
  notes TEXT,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  zip TEXT,
  service_type TEXT,
  bedrooms INTEGER,
  bathrooms REAL,
  sqft INTEGER,
  frequency TEXT,
  preferred_date TEXT,
  estimated_price REAL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'website',
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  admin_notified INTEGER NOT NULL DEFAULT 0,
  callback_requested INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,          -- out | in | note
  channel TEXT NOT NULL,            -- email | sms | note
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL,             -- sent | failed | received | logged | skipped
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'Cleaner',
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  scheduled_at TEXT NOT NULL,       -- local "YYYY-MM-DDTHH:MM"
  duration_hours REAL NOT NULL DEFAULT 3,
  address TEXT,
  service_type TEXT,
  price REAL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled ON jobs(scheduled_at);

CREATE TABLE IF NOT EXISTS job_assignments (
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  PRIMARY KEY (job_id, employee_id)
);

CREATE TABLE IF NOT EXISTS email_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,      -- unix ms
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_codes(email);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  phone_verified INTEGER NOT NULL DEFAULT 0,
  customer_messages INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,      -- unix ms
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT,
  status TEXT NOT NULL,             -- sent | failed | skipped
  error TEXT,
  lead_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- client & host portals ----------
-- One login per customer. A host is a customer with is_host = 1 (they own rental properties).
CREATE TABLE IF NOT EXISTS portal_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,               -- "scrypt$<salt hex>$<hash hex>", NULL until the client sets one
  enabled INTEGER NOT NULL DEFAULT 1,
  is_host INTEGER NOT NULL DEFAULT 0,
  email_updates INTEGER NOT NULL DEFAULT 1,   -- booking / request updates by email
  session_version INTEGER NOT NULL DEFAULT 1, -- bumped on password change: logs out other devices
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One-time links for "set your password" (invite) and "forgot password" (reset).
CREATE TABLE IF NOT EXISTS password_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES portal_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,  -- sha256 of the token; the token itself is only in the email
  purpose TEXT NOT NULL,            -- set | reset
  expires_at INTEGER NOT NULL,      -- unix ms
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  bedrooms INTEGER,
  bathrooms REAL,
  access_notes TEXT,
  checkout_time TEXT,               -- "HH:MM"
  checkin_time TEXT,                -- "HH:MM"
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_properties_customer ON properties(customer_id);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  number TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',   -- draft | sent | paid | void
  due_date TEXT,                    -- "YYYY-MM-DD"
  pay_url TEXT,                     -- e.g. a Stripe Payment Link
  notes TEXT,
  sent_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);

-- Reschedule / cancel / turnover requests from the portals. The admin approves or declines them.
CREATE TABLE IF NOT EXISTS portal_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,               -- reschedule | cancel | turnover
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
  requested_at TEXT,                -- reschedule: new "YYYY-MM-DDTHH:MM"; turnover: the cleaning date "YYYY-MM-DD"
  checkout_time TEXT,
  checkin_time TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | declined
  admin_note TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON portal_requests(status);

CREATE TABLE IF NOT EXISTS job_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  notes TEXT,
  damage_notes TEXT,
  inventory_notes TEXT,
  photos TEXT NOT NULL DEFAULT '[]',  -- JSON [{file, name, type, size, uploaded_at}]; files live in UPLOADS_DIR/jobs/<job_id>/
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Other website forms (event quotes, job applications, gift card orders, referrals, local area quotes).
CREATE TABLE IF NOT EXISTS form_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form TEXT NOT NULL,               -- the form's name as the website sends it, e.g. "Careers", "Gift card"
  name TEXT,
  email TEXT,
  phone TEXT,
  preferred_contact TEXT,
  fields TEXT NOT NULL DEFAULT '{}', -- JSON {field name: text}
  request_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_request ON form_submissions(request_id) WHERE request_id IS NOT NULL;
`;

// Columns added after the first release. SQLite has no "ADD COLUMN IF NOT EXISTS", so check first.
function migrate(db) {
  const has = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
  if (!has('jobs', 'property_id')) {
    db.exec('ALTER TABLE jobs ADD COLUMN property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id); CREATE INDEX IF NOT EXISTS idx_jobs_property ON jobs(property_id);');

  const add = (table, col, type) => { if (!has(table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); };
  // Estimates are always priced by the server from public/pricing.js and stored itemized.
  add('leads', 'addons', 'TEXT');                // comma list of add-on ids, e.g. "fridge,oven"
  add('leads', 'organizing_hours', 'REAL');
  add('leads', 'preferred_contact', 'TEXT');     // phone | email | text
  add('leads', 'request_id', 'TEXT');
  add('leads', 'preferred_time', 'TEXT');
  add('leads', 'referred_by', 'TEXT');
  add('leads', 'gift_code', 'TEXT');            // sent by the website so a double submit is saved once
  add('leads', 'price_lines', 'TEXT');           // JSON [{kind, label, amount}] incl. the "Travel Fee — $20" line
  add('leads', 'price_subtotal', 'REAL');
  add('leads', 'price_discount', 'REAL');
  add('leads', 'travel_fee', 'REAL');            // estimated_price is the total (travel fee included)
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_request ON leads(request_id) WHERE request_id IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at)');
  add('customers', 'marketing_opt_in_at', 'TEXT');
  // A booking made from a lead keeps the lead's itemized estimate (same JSON shape as below).
  add('jobs', 'price_breakdown', 'TEXT');        // JSON {lines, subtotal, discount, travel_fee, total}
  // Invoice line items: JSON [{description, amount, kind}]. amount is always the sum of the items.
  add('invoices', 'items', 'TEXT');
  // Delivery log: what was sent (so a failed one can be retried) and how many tries it took.
  add('notifications', 'payload', 'TEXT');
  add('notifications', 'attempts', 'INTEGER NOT NULL DEFAULT 1');
  add('notifications', 'form_id', 'INTEGER');
  add('notifications', 'updated_at', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_lead ON notifications(lead_id)');
}

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

module.exports = { openDb };

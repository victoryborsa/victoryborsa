const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openDb } = require('../src/db');
const { quote, estimatePrice, PRICING } = require('../public/pricing');
const { setup } = require('./helpers');

const travelLines = (q) => q.lines.filter((l) => l.kind === 'travel');
const lead = (extra) => ({ name: 'Price Check', phone: '4125550180', ...extra });

test('exact prices from pricing.js, travel fee included once', () => {
  // deep, 2 bedrooms = $309 + $20
  const deep = quote({ service: 'deep', size: '2' });
  assert.equal(deep.total, 329);
  assert.deepEqual(deep.lines.map((l) => [l.kind, l.amount]), [['service', 309], ['travel', 20]]);
  assert.equal(travelLines(deep)[0].label, 'Travel Fee — $20');

  // deep + fridge: the fridge is included in a deep clean, never charged again
  const fridge = quote({ service: 'deep', size: '2', addons: ['fridge'] });
  assert.equal(fridge.total, 329);
  assert.ok(fridge.lines.some((l) => l.kind === 'included' && l.amount === 0));

  // recurring, 1 bedroom, weekly: $149 − $22 (15%) + $20
  const weekly = quote({ service: 'recurring', size: '1', frequency: 'weekly' });
  assert.equal(weekly.total, 147);
  assert.equal(weekly.discount, 22);

  // standard, 2 bedrooms + fridge + oven + 2 hrs organizing: 189 + 35 + 35 + 100 + 20
  assert.equal(estimatePrice({ service: 'standard', size: '2', addons: 'fridge,oven,organizing', organizingHours: 2 }), 379);

  // airbnb, 4 bedrooms: custom quote, but the travel fee is still noted
  const airbnb = quote({ service: 'airbnb', size: '4' });
  assert.equal(airbnb.quoteOnly, true);
  assert.equal(airbnb.total, null);
  assert.equal(travelLines(airbnb).length, 1);
  assert.equal(estimatePrice({ service: 'airbnb', size: '4' }), null);
});

test('travel fee appears exactly once, even with every add-on', () => {
  const all = PRICING.addons.map((a) => a.id);
  for (const service of Object.keys(PRICING.services)) {
    const q = quote({ service, size: '3', frequency: 'weekly', addons: [...all, ...all], organizingHours: 3 });
    assert.equal(travelLines(q).length, 1, service);
    assert.equal(travelLines(q)[0].amount, PRICING.travelFee, service);
  }
});

test('a recurring discount never touches the travel fee or the add-ons', () => {
  for (const frequency of ['weekly', 'biweekly', 'monthly']) {
    const q = quote({ service: 'recurring', size: '3', frequency, addons: ['laundry', 'dishes'] });
    const price = PRICING.services.recurring.prices[2];
    const discount = Math.round(price * PRICING.frequency[frequency].discount);
    assert.equal(q.discount, discount);
    assert.equal(q.total, price - discount + 25 + 30 + PRICING.travelFee, frequency);
    assert.equal(travelLines(q)[0].amount, 20);
  }
});

test('server prices every lead itself: tampered prices ignored, breakdown stored, quote-only saved with no price', async (t) => {
  const s = setup();
  t.after(s.close);
  const cases = [
    [{ service_type: 'deep', bedrooms: '2' }, 329],
    [{ service_type: 'deep', bedrooms: '2', addons: ['fridge'] }, 329],
    [{ service_type: 'recurring', bedrooms: '1', frequency: 'weekly' }, 147],
    [{ service_type: 'standard', bedrooms: '2', addons: ['fridge', 'oven', 'organizing'], organizing_hours: 2 }, 379],
    [{ service: 'standard', size: '2', addons: 'fridge,oven,organizing', organizingHours: 2 }, 379],
  ];
  for (const [i, [body, total]] of cases.entries()) {
    const r = await s.req('/api/leads', { method: 'POST', body: lead({ ...body, phone: `41255501${80 + i}`, estimated_price: 5, estimated_total: 5 }) });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.estimated_price, total, JSON.stringify(body));
    assert.equal(r.data.quote.total, total);
    assert.equal(r.data.duplicate, false);
    assert.ok(r.data.lead_id);
  }

  const airbnb = await s.req('/api/leads', { method: 'POST', body: lead({ email: 'host@example.com', service_type: 'airbnb', bedrooms: '4', estimated_price: 99 }) });
  assert.equal(airbnb.status, 201);
  assert.equal(airbnb.data.estimated_price, null);
  assert.equal(airbnb.data.breakdown.quote_only, true);
  assert.deepEqual(airbnb.data.breakdown.lines.map((l) => l.label), ['Travel Fee — $20']);
  for (const service of ['event', 'commercial', 'postconstruction', 'upholstery']) {
    const r = await s.req('/api/leads', { method: 'POST', body: lead({ phone: '4125550199', service_type: service, request_id: `quote-only-${service}` }) });
    assert.equal(r.data.estimated_price, null, service);
    assert.equal(r.data.breakdown.travel_fee, 20, service);
  }

  await s.login();
  const stored = (await s.req(`/api/admin/leads/${airbnb.data.id}`)).data;
  assert.equal(stored.estimated_price, null);
  assert.equal(stored.travel_fee, 20);
  const leads = (await s.req('/api/admin/leads')).data;
  const standard = leads.find((l) => l.service_type === 'standard');
  assert.equal(standard.addons, 'fridge,oven,organizing');
  assert.equal(standard.organizing_hours, 2);
  assert.equal(standard.price_subtotal, 359);
  assert.equal(standard.travel_fee, 20);
  assert.equal(JSON.parse(standard.price_lines).filter((l) => l.kind === 'travel').length, 1);

  // Alerts: owner email and customer confirmation show the lines, the travel fee, the total and the note.
  await s.until(() => s.sent.some((m) => m.to === 'host@example.com'));
  const confirmation = s.sent.find((m) => m.to === 'host@example.com');
  assert.match(confirmation.text, /Travel Fee — \$20/);
  assert.match(confirmation.text, /custom quote/);
  assert.match(confirmation.text, /This is an estimate, not a booking\. Your appointment is confirmed when we contact you to confirm the date and time\./);
});

test('estimate emails list every line with the Travel Fee and the total', async (t) => {
  const s = setup();
  t.after(s.close);
  const r = await s.req('/api/leads', { method: 'POST', body: lead({ email: 'kim@example.com', service_type: 'recurring', bedrooms: '1', frequency: 'weekly', addons: ['laundry'], preferred_contact: 'email' }) });
  assert.equal(r.data.estimated_price, 172);
  await s.until(() => s.sent.filter((m) => m.channel === 'email').length >= 2);
  for (const to of ['owner@example.com', 'kim@example.com']) {
    const m = s.sent.find((x) => x.to === to);
    assert.match(m.text, /Recurring Cleaning — 1 Bedroom: \$149/, to);
    assert.match(m.text, /One laundry load: \$25/, to);
    assert.match(m.text, /Weekly discount \(15% off cleaning\): −\$22/, to);
    assert.equal(m.text.match(/Travel Fee — \$20/g).length, 1, to);
    assert.match(m.text, /Total: \$172/, to);
    assert.match(m.text, /This is an estimate, not a booking\. Your appointment is confirmed when we contact you to confirm the date and time\./, to);
  }
});

test('request_id and a quick repeat are saved once and alert once', async (t) => {
  const s = setup();
  t.after(s.close);
  const body = lead({ email: 'dup@example.com', service_type: 'deep', bedrooms: '2', request_id: 'b1f2c3d4-0000-4000-8000-000000000001' });
  const first = await s.req('/api/leads', { method: 'POST', body });
  assert.equal(first.status, 201);
  await s.until(() => s.sent.length >= 3);
  const sentAfterFirst = s.sent.length;
  const again = await s.req('/api/leads', { method: 'POST', body: { ...body, name: 'Changed Name' } });
  assert.equal(again.status, 200);
  assert.equal(again.data.id, first.data.id);
  assert.equal(again.data.duplicate, true);
  assert.equal(again.data.quote.total, 329);

  // No request_id, but the same phone asking for the same service within 2 minutes
  const noId = await s.req('/api/leads', { method: 'POST', body: lead({ email: 'dup@example.com', service_type: 'deep', bedrooms: '3' }) });
  assert.equal(noId.status, 200);
  assert.equal(noId.data.id, first.data.id);
  // A different service is a new request
  const other = await s.req('/api/leads', { method: 'POST', body: lead({ email: 'dup@example.com', service_type: 'standard', bedrooms: '2' }) });
  assert.equal(other.status, 201);
  assert.notEqual(other.data.id, first.data.id);

  await s.until(() => false);
  await s.login();
  assert.equal((await s.req('/api/admin/leads')).data.length, 2);
  // Only the new (standard) request sent alerts after the first one.
  assert.equal(s.sent.length - sentAfterFirst, 3);
});

test('database upgrade: existing leads and notifications get the new columns without losing data', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'shinepro-migrate2-')), 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE leads (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, name TEXT NOT NULL, email TEXT, phone TEXT, address TEXT, zip TEXT,
              service_type TEXT, bedrooms INTEGER, bathrooms REAL, sqft INTEGER, frequency TEXT, preferred_date TEXT, estimated_price REAL, message TEXT,
              status TEXT NOT NULL DEFAULT 'new', source TEXT NOT NULL DEFAULT 'website', marketing_opt_in INTEGER NOT NULL DEFAULT 0,
              admin_notified INTEGER NOT NULL DEFAULT 0, callback_requested INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
            CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, channel TEXT NOT NULL, recipient TEXT, status TEXT NOT NULL,
              error TEXT, lead_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
            INSERT INTO leads (name, phone, estimated_price) VALUES ('Old Lead', '+14125550100', 199);
            INSERT INTO notifications (kind, channel, recipient, status) VALUES ('new_lead', 'email', 'o@example.com', 'failed');`);
  old.close();
  const db = openDb(file);
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  for (const c of ['addons', 'preferred_contact', 'request_id', 'price_lines', 'price_subtotal', 'price_discount', 'travel_fee', 'preferred_time']) assert.ok(cols('leads').includes(c), c);
  for (const c of ['payload', 'attempts', 'form_id']) assert.ok(cols('notifications').includes(c), c);
  assert.ok(cols('invoices').includes('items'));
  assert.ok(cols('jobs').includes('price_breakdown'));
  assert.equal(db.prepare('SELECT estimated_price FROM leads').get().estimated_price, 199);
  assert.equal(db.prepare('SELECT attempts FROM notifications').get().attempts, 1);
  db.close();
  openDb(file).close(); // running it twice is safe
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
});

test('validation: phone or email, preferred contact must match', async (t) => {
  const s = setup();
  t.after(s.close);
  const bad = async (body, re) => {
    const r = await s.req('/api/leads', { method: 'POST', body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.data.error, re);
  };
  await bad({ name: 'X' }, /phone number or email/);
  await bad({ name: 'X', phone: '4125550100', preferred_contact: 'email' }, /email address/);
  await bad({ name: 'X', email: 'x@example.com', preferred_contact: 'text' }, /phone number/);
  await bad({ name: 'X', email: 'x@example.com', preferred_contact: 'pigeon' }, /Preferred contact/);
  const ok = await s.req('/api/leads', { method: 'POST', body: { name: 'X', email: 'x@example.com', preferred_contact: 'email', service_type: 'deep', bedrooms: 2 } });
  assert.equal(ok.status, 201);
});

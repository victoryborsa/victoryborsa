const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createApp } = require('../src/app');
const { openDb } = require('../src/db');
const { loadConfig } = require('../src/config');

function setup({ emailEnabled = true, smsEnabled = true, failEmail = false } = {}) {
  const config = loadConfig({
    ADMIN_PASSWORD: 'test-password-123',
    SESSION_SECRET: 'x'.repeat(40),
    ALERT_EMAILS: 'owner@example.com',
    ALERT_PHONES: '412-555-0100',
    TWILIO_AUTH_TOKEN: 'twilio-token',
    PUBLIC_URL: 'http://localhost',
    ALLOWED_ORIGINS: 'https://pghshinepro.com',
  });
  const sent = [];
  const senders = {
    emailEnabled,
    smsEnabled,
    async email(m) { if (failEmail) throw new Error('SMTP down'); sent.push({ channel: 'email', ...m }); },
    async sms(m) { sent.push({ channel: 'sms', ...m }); },
  };
  const app = createApp({ config, db: openDb(':memory:'), senders });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const req = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      redirect: 'manual',
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let data = text;
    try { data = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, data, headers: res.headers };
  };
  const login = () => req('/api/admin/login', { method: 'POST', body: { password: 'test-password-123' } });
  const until = async (fn) => { for (let i = 0; i < 50; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 10)); } };
  return { app, server, req, login, sent, config, until, close: () => server.close() };
}

const quote = {
  name: 'Jane Doe', email: 'Jane@Example.com', phone: '(412) 555-0199', address: '1 Main St', zip: '15213',
  service_type: 'deep', bedrooms: 3, bathrooms: 2, sqft: 1800, frequency: 'biweekly', marketing_opt_in: true,
  estimated_price: 1, // tampered — server must recompute
};

test('website quote is saved as lead + customer, and owner is alerted by email and text', async (t) => {
  const s = setup();
  t.after(s.close);
  const r = await s.req('/api/leads', { method: 'POST', body: quote, headers: { Origin: 'https://pghshinepro.com' } });
  assert.equal(r.status, 201);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://pghshinepro.com');
  // deep 200 + 3*25 + 2*30 + 40 (sqft) = 375, minus 10% = 337.5 -> 338
  assert.equal(r.data.estimated_price, 338);

  await s.until(() => s.sent.length >= 3);
  const ownerEmail = s.sent.find((m) => m.channel === 'email' && m.to === 'owner@example.com');
  const ownerSms = s.sent.find((m) => m.channel === 'sms');
  const confirmation = s.sent.find((m) => m.to === 'jane@example.com');
  assert.ok(ownerEmail && ownerEmail.text.includes('Jane Doe') && ownerEmail.text.includes('+14125550199'));
  assert.equal(ownerSms.to, '+14125550100');
  assert.ok(confirmation.text.includes('$338'));

  await s.login();
  const leads = await s.req('/api/admin/leads');
  assert.equal(leads.data.length, 1);
  assert.equal(leads.data[0].status, 'new');
  assert.equal(leads.data[0].admin_notified, 1);
  const customers = await s.req('/api/admin/customers');
  assert.equal(customers.data.length, 1);
  assert.equal(customers.data[0].email, 'jane@example.com');
  assert.equal(customers.data[0].marketing_opt_in, 1);

  // Second quote from the same person reuses the customer record
  await s.req('/api/leads', { method: 'POST', body: { ...quote, email: 'jane@example.com' } });
  assert.equal((await s.req('/api/admin/customers')).data.length, 1);
  assert.equal((await s.req('/api/admin/leads')).data.length, 2);
});

test('lead is still saved when alerts fail, and failure is visible', async (t) => {
  const s = setup({ failEmail: true, smsEnabled: false });
  t.after(s.close);
  const r = await s.req('/api/leads', { method: 'POST', body: quote });
  assert.equal(r.status, 201);
  await s.login();
  await s.until(() => false);
  const stats = await s.req('/api/admin/stats');
  assert.equal(stats.data.new_leads, 1);
  assert.equal(stats.data.failed_alerts, 1); // owner email failed (no SMS provider, so no text attempted)
  const lead = await s.req(`/api/admin/leads/${r.data.id}`);
  assert.equal(lead.data.admin_notified, 0);
});

test('validation and spam protection', async (t) => {
  const s = setup();
  t.after(s.close);
  assert.equal((await s.req('/api/leads', { method: 'POST', body: { name: 'No Contact' } })).status, 400);
  assert.equal((await s.req('/api/leads', { method: 'POST', body: { name: 'Bad', email: 'nope' } })).status, 400);
  const bot = await s.req('/api/leads', { method: 'POST', body: { ...quote, company_website: 'spam.biz' } });
  assert.equal(bot.status, 200);
  await s.login();
  assert.equal((await s.req('/api/admin/leads')).data.length, 0);
});

test('plain HTML form posts redirect to thank-you page', async (t) => {
  const s = setup();
  t.after(s.close);
  const r = await s.req('/api/leads', {
    method: 'POST',
    body: new URLSearchParams({ name: 'Form User', phone: '4125550111', service_type: 'standard' }).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
  });
  assert.equal(r.status, 303);
  assert.match(r.headers.get('location'), /^\/thanks\.html\?price=\d+/);
});

test('admin routes require login', async (t) => {
  const s = setup();
  t.after(s.close);
  assert.equal((await s.req('/api/admin/leads')).status, 401);
  assert.equal((await s.req('/api/admin/login', { method: 'POST', body: { password: 'wrong' } })).status, 401);
  assert.equal((await s.login()).status, 200);
  assert.equal((await s.req('/api/admin/leads')).status, 200);
  // form-encoded mutation (CSRF shape) is rejected
  const csrf = await s.req('/api/admin/customers', { method: 'POST', body: 'name=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(csrf.status, 415);
});

test('admin replies to a lead by text and email; status moves to contacted', async (t) => {
  const s = setup();
  t.after(s.close);
  const { data: lead } = await s.req('/api/leads', { method: 'POST', body: quote });
  await s.login();
  await s.until(() => s.sent.length >= 3);
  s.sent.length = 0;

  const sms = await s.req(`/api/admin/leads/${lead.id}/messages`, { method: 'POST', body: { channel: 'sms', body: 'Hi Jane!' } });
  assert.equal(sms.status, 201);
  assert.deepEqual(s.sent[0], { channel: 'sms', to: '+14125550199', body: 'Hi Jane!' });
  const email = await s.req(`/api/admin/leads/${lead.id}/messages`, { method: 'POST', body: { channel: 'email', subject: 'Quote', body: 'Details' } });
  assert.equal(email.status, 201);
  assert.equal(s.sent[1].to, 'jane@example.com');
  await s.req(`/api/admin/leads/${lead.id}/messages`, { method: 'POST', body: { channel: 'note', body: 'Prefers mornings' } });

  const detail = await s.req(`/api/admin/leads/${lead.id}`);
  assert.equal(detail.data.status, 'contacted');
  assert.deepEqual(detail.data.messages.map((m) => m.channel), ['sms', 'email', 'note']);
  // Conversation also shows up on the customer record
  const cust = await s.req(`/api/admin/customers/${detail.data.customer_id}`);
  assert.equal(cust.data.messages.length, 3);
});

test('customer text replies arrive via Twilio webhook (signature checked)', async (t) => {
  const s = setup();
  t.after(s.close);
  const { data: lead } = await s.req('/api/leads', { method: 'POST', body: quote });
  const params = { Body: 'Yes, Friday works', From: '+14125550199' };
  const url = 'http://localhost/api/twilio/sms';
  const sig = crypto.createHmac('sha1', 'twilio-token')
    .update(Object.keys(params).sort().reduce((a, k) => a + k + params[k], url)).digest('base64');

  const bad = await s.req('/api/twilio/sms', { method: 'POST', body: new URLSearchParams(params).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': 'nope' } });
  assert.equal(bad.status, 403);
  const ok = await s.req('/api/twilio/sms', { method: 'POST', body: new URLSearchParams(params).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': sig } });
  assert.equal(ok.status, 200);

  await s.login();
  const detail = await s.req(`/api/admin/leads/${lead.id}`);
  const inbound = detail.data.messages.find((m) => m.direction === 'in');
  assert.equal(inbound.body, 'Yes, Friday works');
  assert.ok(s.sent.some((m) => m.subject && m.subject.includes('Text reply from Jane Doe')));
});

test('customers: add, edit, search, export, delete', async (t) => {
  const s = setup();
  t.after(s.close);
  await s.login();
  const c = await s.req('/api/admin/customers', { method: 'POST', body: { name: 'Bob Smith', phone: '412.555.0123', email: 'bob@x.com', marketing_opt_in: true } });
  assert.equal(c.status, 201);
  assert.equal(c.data.phone, '+14125550123');
  const upd = await s.req(`/api/admin/customers/${c.data.id}`, { method: 'PUT', body: { ...c.data, phone: '4125550124', notes: 'Has a dog' } });
  assert.equal(upd.data.phone, '+14125550124');
  assert.equal(upd.data.notes, 'Has a dog');
  assert.equal((await s.req('/api/admin/customers', { method: 'POST', body: { name: '' } })).status, 400);
  assert.equal((await s.req('/api/admin/customers?q=smith')).data.length, 1);
  assert.equal((await s.req('/api/admin/customers?q=0124')).data.length, 1);
  assert.equal((await s.req('/api/admin/customers?q=zzz')).data.length, 0);
  await s.req('/api/admin/customers', { method: 'POST', body: { name: '=HYPERLINK("x")', email: 'no@x.com' } });
  const csv = await s.req('/api/admin/customers/export.csv?opted_in=1');
  assert.match(csv.data, /Bob Smith,bob@x.com,\(412\) 555-0124/);
  assert.doesNotMatch(csv.data, /HYPERLINK/);
  const all = await s.req('/api/admin/customers/export.csv');
  assert.match(all.data, /'=HYPERLINK/);
  assert.equal((await s.req(`/api/admin/customers/${c.data.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await s.req(`/api/admin/customers/${c.data.id}`)).status, 404);
});

test('employees and jobs: book from lead, assign cleaners, cleaners get notified', async (t) => {
  const s = setup();
  t.after(s.close);
  const { data: lead } = await s.req('/api/leads', { method: 'POST', body: quote });
  await s.login();
  const e1 = (await s.req('/api/admin/employees', { method: 'POST', body: { name: 'Maria Lopez', phone: '4125550150', email: 'maria@x.com' } })).data;
  const e2 = (await s.req('/api/admin/employees', { method: 'POST', body: { name: 'Ann Lee', phone: '4125550151' } })).data;
  const edited = await s.req(`/api/admin/employees/${e2.id}`, { method: 'PUT', body: { ...e2, role: 'Team Lead' } });
  assert.equal(edited.data.role, 'Team Lead');

  const leadDetail = (await s.req(`/api/admin/leads/${lead.id}`)).data;
  await s.until(() => s.sent.length >= 3);
  s.sent.length = 0;
  const job = await s.req('/api/admin/jobs', {
    method: 'POST',
    body: { customer_id: leadDetail.customer_id, lead_id: lead.id, scheduled_at: '2030-05-01T09:00', price: 338, service_type: 'Deep Cleaning', employee_ids: [e1.id], notes: 'Key under mat' },
  });
  assert.equal(job.status, 201);
  assert.equal(job.data.address, '1 Main St');
  assert.deepEqual(job.data.employees.map((e) => e.name), ['Maria Lopez']);
  assert.equal(s.sent.filter((m) => m.to === '+14125550150' || m.to === 'maria@x.com').length, 2);
  assert.ok(s.sent[0].body.includes('Key under mat'));
  assert.equal((await s.req(`/api/admin/leads/${lead.id}`)).data.status, 'booked');

  // Re-assign: only the newly added cleaner is notified
  s.sent.length = 0;
  const upd = await s.req(`/api/admin/jobs/${job.data.id}`, { method: 'PUT', body: { ...job.data, employee_ids: [e1.id, e2.id] } });
  assert.equal(upd.data.employees.length, 2);
  assert.deepEqual(s.sent.map((m) => m.to), ['+14125550151']);

  const week = await s.req('/api/admin/jobs?from=2030-04-28&to=2030-05-05');
  assert.equal(week.data.length, 1);
  assert.equal((await s.req(`/api/admin/jobs?employee_id=${e2.id}`)).data.length, 1);
  assert.equal((await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: 999, scheduled_at: '2030-05-01T09:00' } })).status, 404);
  assert.equal((await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: leadDetail.customer_id, scheduled_at: 'tomorrow' } })).status, 400);
  assert.equal((await s.req(`/api/admin/jobs/${job.data.id}`, { method: 'DELETE' })).status, 200);
});

test('Google Voice mode: email alerts, manual texts are logged, customer replies can be recorded', async (t) => {
  const s = setup({ smsEnabled: false });
  t.after(s.close);
  const { data: lead } = await s.req('/api/leads', { method: 'POST', body: quote });
  await s.until(() => s.sent.length >= 2);
  await s.login();
  assert.equal(s.sent.filter((m) => m.channel === 'sms').length, 0);
  assert.equal((await s.req(`/api/admin/leads/${lead.id}`)).data.admin_notified, 1);
  const stats = (await s.req('/api/admin/stats')).data;
  assert.equal(stats.failed_alerts, 0); // no "SMS skipped" noise
  const meta = (await s.req('/api/admin/meta')).data;
  assert.equal(meta.smsConfigured, false);
  assert.equal(meta.googleVoiceNumber, '(412) 447-8047');

  const out = await s.req(`/api/admin/leads/${lead.id}/messages`, { method: 'POST', body: { channel: 'gvoice', body: 'Hi Jane, this is Shine Pro!' } });
  assert.equal(out.status, 201);
  assert.equal(out.data.status, 'gvoice');
  const reply = await s.req(`/api/admin/leads/${lead.id}/messages`, { method: 'POST', body: { channel: 'sms_in', body: 'Friday works' } });
  assert.equal(reply.data.direction, 'in');
  const detail = (await s.req(`/api/admin/leads/${lead.id}`)).data;
  assert.equal(detail.status, 'contacted');
  assert.deepEqual(detail.messages.map((m) => [m.direction, m.channel]), [['out', 'sms'], ['in', 'sms']]);

  // Cleaners are emailed; no text attempts (and no failure) without an SMS provider
  const e = (await s.req('/api/admin/employees', { method: 'POST', body: { name: 'Maria', phone: '4125550150', email: 'maria@x.com' } })).data;
  s.sent.length = 0;
  const job = await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: detail.customer_id, scheduled_at: '2030-05-01T09:00', employee_ids: [e.id] } });
  assert.deepEqual(job.data.notifications.map((n) => n.ok), [true]);
  assert.deepEqual(s.sent.map((m) => m.to), ['maria@x.com']);
});

test('pages and embed are served', async (t) => {
  const s = setup();
  t.after(s.close);
  for (const p of ['/admin', '/quote', '/embed.js', '/pricing.js', '/admin.js', '/styles.css', '/thanks.html']) {
    assert.equal((await s.req(p)).status, 200, p);
  }
  assert.equal((await s.req('/api/pricing')).data.services.deep.base, 200);
});

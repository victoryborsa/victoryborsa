const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { setup } = require('./helpers');
const { openDb } = require('../src/db');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const FUTURE = '2030-05-01T09:00';
const PAST = '2020-03-02T10:00';

const lastLink = (s, to) => {
  const m = [...s.sent].reverse().find((x) => x.to === to && /set-password\?token=/.test(x.text || ''));
  return m ? /token=([\w-]+)/.exec(m.text)[1] : null;
};

// Admin creates a client, turns on portal access (emailing the set-password link), and the
// client sets a password in their own browser session.
async function makeClient(s, { name, email, host = false, password = 'client-pass-1' }) {
  const customer = (await s.req('/api/admin/customers', { method: 'POST', body: { name, email, phone: '4125550170', address: `${name} St` } })).data;
  const enabled = await s.req(`/api/admin/customers/${customer.id}/portal`, { method: 'PUT', body: { enabled: true, is_host: host, send_link: true } });
  assert.equal(enabled.status, 200, JSON.stringify(enabled.data));
  const token = lastLink(s, email);
  assert.ok(token, 'set-password link emailed');
  const req = s.session();
  const set = await req('/api/portal/set-password', { method: 'POST', body: { token, password } });
  assert.equal(set.status, 200, JSON.stringify(set.data));
  return { customer, req, token, password };
}

test('portal login: admin invite link, set password, login, logout, wrong password, one-time link', async (t) => {
  const s = setup();
  t.after(s.close);
  await s.login();
  const a = await makeClient(s, { name: 'Amy Client', email: 'amy@example.com' });
  const invite = s.sent.find((m) => m.to === 'amy@example.com');
  assert.match(invite.subject, /Set up your/);
  assert.match(invite.text, /http:\/\/localhost\/portal\/set-password\?token=/);

  // Logged in right after setting the password
  assert.equal((await a.req('/api/portal/session')).data.loggedIn, true);
  assert.equal((await a.req('/api/portal/dashboard')).status, 200);
  // The link only works once
  assert.equal((await s.session()('/api/portal/set-password', { method: 'POST', body: { token: a.token, password: 'another-pass' } })).status, 400);

  await a.req('/api/portal/logout', { method: 'POST', body: {} });
  assert.equal((await a.req('/api/portal/dashboard')).status, 401);
  assert.equal((await a.req('/api/portal/login', { method: 'POST', body: { email: 'amy@example.com', password: 'nope-nope' } })).status, 401);
  const ok = await a.req('/api/portal/login', { method: 'POST', body: { email: 'AMY@example.com', password: 'client-pass-1' } });
  assert.equal(ok.status, 200);
  assert.equal((await a.req('/api/portal/dashboard')).status, 200);

  // Password is stored hashed with scrypt + salt, never in plain text
  const row = s.app.locals.db.prepare('SELECT password_hash FROM portal_accounts WHERE email = ?').get('amy@example.com');
  assert.match(row.password_hash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);

  // Portal cookie is not an admin cookie, and the admin cookie is not a portal login
  assert.equal((await a.req('/api/admin/customers')).status, 401);
  assert.equal((await s.req('/api/portal/dashboard')).status, 401);
  // JSON only for changes (blocks cross-site form posts)
  assert.equal((await a.req('/api/portal/profile', { method: 'PUT', body: 'name=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 415);

  // Admin turns access off: the session stops working immediately
  await s.req(`/api/admin/customers/${a.customer.id}/portal`, { method: 'PUT', body: { enabled: false } });
  assert.equal((await a.req('/api/portal/dashboard')).status, 401);
  assert.equal((await a.req('/api/portal/login', { method: 'POST', body: { email: 'amy@example.com', password: 'client-pass-1' } })).status, 401);
});

test('portal login is rate limited', async (t) => {
  const s = setup();
  t.after(s.close);
  const req = s.session();
  for (let i = 0; i < 10; i++) {
    assert.equal((await req('/api/portal/login', { method: 'POST', body: { email: 'x@example.com', password: 'wrong-pass' } })).status, 401);
  }
  assert.equal((await req('/api/portal/login', { method: 'POST', body: { email: 'x@example.com', password: 'wrong-pass' } })).status, 429);
});

test('forgot password and self sign-up only email existing customers; reset logs out old sessions', async (t) => {
  const s = setup();
  t.after(s.close);
  await s.login();
  const a = await makeClient(s, { name: 'Ben Client', email: 'ben@example.com' });
  const other = s.session();

  // Unknown email: same answer, nothing sent
  s.sent.length = 0;
  const stranger = await other('/api/portal/register', { method: 'POST', body: { email: 'stranger@example.com' } });
  assert.equal(stranger.status, 200);
  assert.equal(s.sent.length, 0);
  const forgotStranger = await other('/api/portal/forgot', { method: 'POST', body: { email: 'stranger@example.com' } });
  assert.equal(forgotStranger.data.message, stranger.data.message);
  assert.equal(s.sent.length, 0);

  // A customer without an account can sign up: the link goes to the email on their record
  await s.req('/api/admin/customers', { method: 'POST', body: { name: 'Cara New', email: 'cara@example.com' } });
  const reg = await other('/api/portal/register', { method: 'POST', body: { email: 'Cara@Example.com' } });
  assert.equal(reg.data.message, stranger.data.message);
  const caraToken = lastLink(s, 'cara@example.com');
  assert.ok(caraToken);
  assert.equal((await other(`/api/portal/password-link?token=${caraToken}`)).data.purpose, 'set');
  assert.equal((await other('/api/portal/set-password', { method: 'POST', body: { token: caraToken, password: 'short' } })).status, 400);
  assert.equal((await other('/api/portal/set-password', { method: 'POST', body: { token: caraToken, password: 'cara-pass-123' } })).status, 200);
  assert.equal((await other('/api/portal/profile')).data.name, 'Cara New');

  // Forgot password: reset link, old password stops working, other sessions are logged out
  s.sent.length = 0;
  await s.session()('/api/portal/forgot', { method: 'POST', body: { email: 'ben@example.com' } });
  const reset = s.sent.find((m) => m.to === 'ben@example.com');
  assert.match(reset.subject, /Reset your/);
  const token = lastLink(s, 'ben@example.com');
  const fresh = s.session();
  assert.equal((await fresh('/api/portal/set-password', { method: 'POST', body: { token, password: 'brand-new-pass' } })).status, 200);
  assert.equal((await a.req('/api/portal/dashboard')).status, 401);
  assert.equal((await fresh('/api/portal/login', { method: 'POST', body: { email: 'ben@example.com', password: a.password } })).status, 401);
  assert.equal((await fresh('/api/portal/login', { method: 'POST', body: { email: 'ben@example.com', password: 'brand-new-pass' } })).status, 200);

  // Expired links are refused
  const t2 = (await s.session()('/api/portal/forgot', { method: 'POST', body: { email: 'ben@example.com' } }), lastLink(s, 'ben@example.com'));
  s.app.locals.db.prepare('UPDATE password_tokens SET expires_at = 1 WHERE used_at IS NULL').run();
  assert.equal((await s.session()('/api/portal/set-password', { method: 'POST', body: { token: t2, password: 'whatever-123' } })).status, 400);

  // A disabled account can't sign itself back up
  const ben = (await s.req('/api/admin/customers?q=ben')).data[0];
  await s.req(`/api/admin/customers/${ben.id}/portal`, { method: 'PUT', body: { enabled: false } });
  s.sent.length = 0;
  await s.session()('/api/portal/register', { method: 'POST', body: { email: 'ben@example.com' } });
  assert.equal(s.sent.length, 0);
});

test('profile: edit details and email preferences, change password', async (t) => {
  const s = setup();
  t.after(s.close);
  await s.login();
  const a = await makeClient(s, { name: 'Dana Client', email: 'dana@example.com' });
  const upd = await a.req('/api/portal/profile', { method: 'PUT', body: { name: 'Dana C. Client', phone: '412-555-0177', address: '5 Elm St', city: 'Pittsburgh', zip: '15206', marketing_opt_in: true, email_updates: false } });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.phone, '+14125550177');
  assert.equal(upd.data.email_updates, 0);
  const c = (await s.req(`/api/admin/customers/${a.customer.id}`)).data;
  assert.equal(c.name, 'Dana C. Client');
  assert.equal(c.marketing_opt_in, 1);
  assert.equal(c.portal_account.email_updates, 0);
  assert.equal((await a.req('/api/portal/profile', { method: 'PUT', body: { name: '' } })).status, 400);

  assert.equal((await a.req('/api/portal/password', { method: 'POST', body: { current_password: 'wrong', new_password: 'next-pass-123' } })).status, 400);
  assert.equal((await a.req('/api/portal/password', { method: 'POST', body: { current_password: a.password, new_password: 'next-pass-123' } })).status, 200);
  assert.equal((await a.req('/api/portal/dashboard')).status, 200); // still logged in on this device
  assert.equal((await s.session()('/api/portal/login', { method: 'POST', body: { email: 'dana@example.com', password: 'next-pass-123' } })).status, 200);
});

test("access control: a client only ever sees their own jobs, invoices, properties, reports and photos", async (t) => {
  const s = setup();
  t.after(s.close);
  await s.login();
  const a = await makeClient(s, { name: 'Alice Host', email: 'alice@example.com', host: true });
  const b = await makeClient(s, { name: 'Bob Host', email: 'bob@example.com', host: true });

  const propB = (await s.req('/api/admin/properties', { method: 'POST', body: { customer_id: b.customer.id, name: 'Bob Loft', address: '9 River Rd' } })).data;
  const jobB = (await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: b.customer.id, property_id: propB.id, scheduled_at: FUTURE, price: 150 } })).data;
  const pastB = (await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: b.customer.id, property_id: propB.id, scheduled_at: PAST, status: 'completed' } })).data;
  await s.req(`/api/admin/jobs/${pastB.id}/report`, { method: 'PUT', body: { notes: 'Bob only', damage_notes: 'Broken lamp' } });
  const photo = (await s.req(`/api/admin/jobs/${pastB.id}/report/photos`, { method: 'POST', body: { name: 'lamp.png', data: PNG } })).data.photos[0];
  const invB = (await s.req('/api/admin/invoices', { method: 'POST', body: { job_id: jobB.id, status: 'sent' } })).data;
  const jobA = (await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: a.customer.id, scheduled_at: FUTURE } })).data;

  // Admin can't attach Bob's property to Alice's job
  assert.equal((await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: a.customer.id, property_id: propB.id, scheduled_at: FUTURE } })).status, 400);

  // Bob sees his own things
  assert.equal((await b.req('/api/portal/bookings')).data.upcoming.length, 1);
  assert.equal((await b.req(`/api/portal/invoices/${invB.id}`)).status, 200);
  assert.equal((await b.req(`/api/portal/turnovers/${pastB.id}`)).data.report.damage_notes, 'Broken lamp');
  const own = await b.req(`/api/portal/photos/${pastB.id}/${photo.file}`);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('content-type'), 'image/png');

  // Alice sees none of Bob's
  const bookings = (await a.req('/api/portal/bookings')).data;
  assert.deepEqual([...bookings.upcoming, ...bookings.past].map((j) => j.id), [jobA.id]);
  assert.equal((await a.req('/api/portal/invoices')).data.length, 0);
  assert.equal((await a.req(`/api/portal/invoices/${invB.id}`)).status, 404);
  assert.equal((await a.req('/api/portal/properties')).data.length, 0);
  assert.equal((await a.req(`/api/portal/properties/${propB.id}`)).status, 404);
  assert.equal((await a.req(`/api/portal/properties/${propB.id}`, { method: 'PUT', body: { name: 'Mine now', address: 'x' } })).status, 404);
  assert.equal((await a.req('/api/portal/turnovers')).data.past.length, 0);
  assert.equal((await a.req(`/api/portal/turnovers/${pastB.id}`)).status, 404);
  assert.equal((await a.req(`/api/portal/photos/${pastB.id}/${photo.file}`)).status, 404);
  assert.equal((await a.req(`/api/portal/bookings/${jobB.id}/reschedule`, { method: 'POST', body: { scheduled_at: '2030-06-01T10:00' } })).status, 404);
  assert.equal((await a.req(`/api/portal/bookings/${jobB.id}/cancel`, { method: 'POST', body: {} })).status, 404);
  assert.equal((await a.req('/api/portal/turnovers', { method: 'POST', body: { property_id: propB.id, date: '2030-06-01' } })).status, 404);
  // Path tricks don't reach files either
  assert.equal((await a.req(`/api/portal/photos/${jobA.id}/..%2F${pastB.id}%2F${photo.file}`)).status, 404);
  // Not logged in: nothing
  const anon = s.session();
  for (const p of ['/api/portal/bookings', '/api/portal/invoices', '/api/portal/properties', `/api/portal/photos/${pastB.id}/${photo.file}`, '/api/portal/profile']) {
    assert.equal((await anon(p)).status, 401, p);
  }
  // Admin can view the photo
  assert.equal((await s.req(`/api/admin/photos/${pastB.id}/${photo.file}`)).status, 200);

  // A regular (non-host) client can't use host routes
  const c = await makeClient(s, { name: 'Carl Client', email: 'carl@example.com' });
  assert.equal((await c.req('/api/portal/properties')).status, 403);
  assert.equal((await c.req('/api/portal/turnovers')).status, 403);
  // Draft invoices are hidden from the client
  const draft = (await s.req('/api/admin/invoices', { method: 'POST', body: { customer_id: c.customer.id, amount: 99 } })).data;
  assert.equal((await c.req('/api/portal/invoices')).data.length, 0);
  assert.equal((await c.req(`/api/portal/invoices/${draft.id}`)).status, 404);
});

test('bookings: upcoming/past list, reschedule and cancel requests, admin approves or declines, client emailed', async (t) => {
  const s = setup({ smsEnabled: false });
  t.after(s.close);
  await s.login();
  const a = await makeClient(s, { name: 'Erin Client', email: 'erin@example.com' });
  const maria = (await s.req('/api/admin/employees', { method: 'POST', body: { name: 'Maria Lopez', email: 'maria@x.com', phone: '4125550150' } })).data;
  const job = (await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: a.customer.id, scheduled_at: FUTURE, service_type: 'Deep Cleaning', employee_ids: [maria.id] } })).data;
  const job2 = (await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: a.customer.id, scheduled_at: '2030-07-01T09:00' } })).data;
  const old = (await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: a.customer.id, scheduled_at: PAST, status: 'completed' } })).data;

  const list = (await a.req('/api/portal/bookings')).data;
  assert.deepEqual(list.upcoming.map((j) => j.id), [job.id, job2.id]);
  assert.deepEqual(list.past.map((j) => j.id), [old.id]);
  assert.deepEqual(list.upcoming[0].cleaners, ['Maria']); // first name only
  assert.equal(JSON.stringify(list).includes('maria@x.com'), false); // no staff contact details
  assert.equal(JSON.stringify(list).includes('4125550150'), false);
  const dash = (await a.req('/api/portal/dashboard')).data;
  assert.equal(dash.next_job.id, job.id);

  // Reschedule request -> admin alert
  s.sent.length = 0;
  assert.equal((await a.req(`/api/portal/bookings/${job.id}/reschedule`, { method: 'POST', body: { scheduled_at: 'soon' } })).status, 400);
  assert.equal((await a.req(`/api/portal/bookings/${old.id}/reschedule`, { method: 'POST', body: { scheduled_at: '2030-06-01T10:00' } })).status, 400);
  const rq = await a.req(`/api/portal/bookings/${job.id}/reschedule`, { method: 'POST', body: { scheduled_at: '2030-05-03T13:00', note: 'Out of town' } });
  assert.equal(rq.status, 201);
  assert.equal((await a.req(`/api/portal/bookings/${job.id}/cancel`, { method: 'POST', body: {} })).status, 409); // one pending request per cleaning
  await s.until(() => s.sent.some((m) => m.to === 'owner@example.com'));
  const alert = s.sent.find((m) => m.to === 'owner@example.com');
  assert.match(alert.subject, /Reschedule request from Erin Client/);
  assert.match(alert.text, /Out of town/);
  assert.equal((await s.req('/api/admin/stats')).data.pending_requests, 1);

  // Admin approves -> job moved, cleaner told, client emailed
  s.sent.length = 0;
  const inbox = (await s.req('/api/admin/requests')).data;
  assert.equal(inbox.length, 1);
  const ok = await s.req(`/api/admin/requests/${inbox[0].id}/approve`, { method: 'POST', body: { admin_note: 'See you then!' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.job.scheduled_at, '2030-05-03T13:00');
  assert.ok(s.sent.some((m) => m.to === 'maria@x.com' && /Schedule change/.test(m.text)));
  const approvedMail = s.sent.find((m) => m.to === 'erin@example.com');
  assert.match(approvedMail.text, /now booked for/);
  assert.match(approvedMail.text, /See you then!/);
  assert.equal((await s.req(`/api/admin/requests/${inbox[0].id}/approve`, { method: 'POST', body: {} })).status, 400);

  // Cancel request -> declined with a note
  const cancel = await a.req(`/api/portal/bookings/${job2.id}/cancel`, { method: 'POST', body: { note: 'Budget' } });
  s.sent.length = 0;
  const dec = await s.req(`/api/admin/requests/${cancel.data.id}/decline`, { method: 'POST', body: { admin_note: 'Less than 24 hours notice' } });
  assert.equal(dec.data.request.status, 'declined');
  assert.match(s.sent.find((m) => m.to === 'erin@example.com').text, /Less than 24 hours notice/);
  assert.equal((await s.req(`/api/admin/jobs/${job2.id}`)).data.status, 'scheduled');
  const after = (await a.req('/api/portal/bookings')).data;
  assert.deepEqual(after.requests.map((r) => r.status).sort(), ['approved', 'declined']);

  // Approved cancellation cancels the job
  const cancel2 = await a.req(`/api/portal/bookings/${job2.id}/cancel`, { method: 'POST', body: {} });
  await s.req(`/api/admin/requests/${cancel2.data.id}/approve`, { method: 'POST', body: {} });
  assert.equal((await s.req(`/api/admin/jobs/${job2.id}`)).data.status, 'cancelled');

  // Client turned off email updates: decisions are not emailed
  await a.req('/api/portal/profile', { method: 'PUT', body: { name: 'Erin Client', email_updates: false } });
  const job3 = (await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: a.customer.id, scheduled_at: '2030-08-01T09:00' } })).data;
  const r3 = await a.req(`/api/portal/bookings/${job3.id}/cancel`, { method: 'POST', body: {} });
  s.sent.length = 0;
  const quiet = await s.req(`/api/admin/requests/${r3.data.id}/decline`, { method: 'POST', body: {} });
  assert.equal(quiet.data.email.status, 'skipped');
  assert.equal(s.sent.filter((m) => m.to === 'erin@example.com').length, 0);

  // New cleaning request becomes a lead linked to the same client
  const nw = await a.req('/api/portal/bookings/new', { method: 'POST', body: { service_type: 'Deep Cleaning', preferred_date: 'Next Friday', message: 'Spring clean' } });
  assert.equal(nw.status, 201);
  const lead = (await s.req(`/api/admin/leads/${nw.data.id}`)).data;
  assert.equal(lead.customer_id, a.customer.id);
  assert.equal(lead.source, 'portal');
  assert.equal(lead.email, 'erin@example.com');
  await s.until(() => s.sent.some((m) => m.to === 'owner@example.com' && /New quote request/.test(m.subject)));
  assert.ok(s.sent.some((m) => m.to === 'owner@example.com' && /New quote request/.test(m.subject)));
});

test('invoices: create from job or blank, pay link, send by email, mark paid / void, printable view', async (t) => {
  const s = setup();
  t.after(s.close);
  await s.login();
  const a = await makeClient(s, { name: 'Fay Client', email: 'fay@example.com' });
  const job = (await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: a.customer.id, scheduled_at: FUTURE, price: 238, service_type: 'Deep Cleaning' } })).data;

  const inv = await s.req('/api/admin/invoices', { method: 'POST', body: { job_id: job.id, due_date: '2030-05-15' } });
  assert.equal(inv.status, 201);
  assert.equal(inv.data.amount, 238); // from the job
  assert.equal(inv.data.customer_id, a.customer.id);
  assert.equal(inv.data.status, 'draft');
  assert.match(inv.data.number, /^SP-\d+$/);
  assert.equal((await s.req('/api/admin/invoices', { method: 'POST', body: { customer_id: a.customer.id } })).status, 400); // amount required
  assert.equal((await s.req(`/api/admin/invoices/${inv.data.id}`, { method: 'PUT', body: { pay_url: 'http://pay.example.com' } })).status, 400);
  assert.equal((await s.req(`/api/admin/invoices/${inv.data.id}`, { method: 'PUT', body: { pay_url: 'javascript:alert(1)' } })).status, 400);
  const linked = await s.req(`/api/admin/invoices/${inv.data.id}`, { method: 'PUT', body: { pay_url: 'https://buy.stripe.com/test_123' } });
  assert.equal(linked.data.pay_url, 'https://buy.stripe.com/test_123');

  // Send: becomes "sent", client gets the pay link and the view link
  s.sent.length = 0;
  const sent = await s.req(`/api/admin/invoices/${inv.data.id}/send`, { method: 'POST', body: {} });
  assert.equal(sent.status, 200);
  assert.equal(sent.data.status, 'sent');
  assert.ok(sent.data.sent_at);
  const mail = s.sent.find((m) => m.to === 'fay@example.com');
  assert.match(mail.subject, /\$238\.00/);
  assert.match(mail.text, /https:\/\/buy\.stripe\.com\/test_123/);
  assert.match(mail.text, new RegExp(`/portal/invoices/${inv.data.id}`));

  const blank = (await s.req('/api/admin/invoices', { method: 'POST', body: { customer_id: a.customer.id, amount: 45.5, notes: 'Extra: inside fridge', status: 'sent' } })).data;
  const mine = (await a.req('/api/portal/invoices')).data;
  assert.equal(mine.length, 2);
  const view = (await a.req(`/api/portal/invoices/${inv.data.id}`)).data;
  assert.equal(view.pay_url, 'https://buy.stripe.com/test_123');
  assert.equal(view.job.service_type, 'Deep Cleaning');
  assert.equal(view.customer.name, 'Fay Client');
  let dash = (await a.req('/api/portal/dashboard')).data;
  assert.deepEqual(dash.open_invoices, { count: 2, total: 283.5 });

  // Paid: no more "Pay now"
  const paid = await s.req(`/api/admin/invoices/${inv.data.id}`, { method: 'PUT', body: { status: 'paid' } });
  assert.ok(paid.data.paid_at);
  assert.equal((await a.req(`/api/portal/invoices/${inv.data.id}`)).data.pay_url, null);
  await s.req(`/api/admin/invoices/${blank.id}`, { method: 'PUT', body: { status: 'void' } });
  dash = (await a.req('/api/portal/dashboard')).data;
  assert.deepEqual(dash.open_invoices, { count: 0, total: 0 });
  assert.equal((await s.req(`/api/admin/invoices/${blank.id}/send`, { method: 'POST', body: {} })).status, 400);
  assert.equal((await s.req('/api/admin/invoices?status=paid')).data.length, 1);
  assert.equal((await s.req(`/api/admin/invoices?customer_id=${a.customer.id}`)).data.length, 2);
  // Duplicate invoice numbers are refused
  assert.equal((await s.req(`/api/admin/invoices/${blank.id}`, { method: 'PUT', body: { number: inv.data.number } })).status, 409);
  // A job from another client can't be put on this client's invoice
  const other = (await s.req('/api/admin/customers', { method: 'POST', body: { name: 'Other' } })).data;
  assert.equal((await s.req('/api/admin/invoices', { method: 'POST', body: { customer_id: other.id, job_id: job.id, amount: 5 } })).status, 400);
  assert.equal((await s.req(`/api/admin/invoices/${blank.id}`, { method: 'DELETE' })).status, 200);
});

test('host: properties, turnover requests, admin approval creates the job, report with photos', async (t) => {
  const s = setup();
  t.after(s.close);
  await s.login();
  const h = await makeClient(s, { name: 'Gina Host', email: 'gina@example.com', host: true });
  assert.match(s.sent.find((m) => m.to === 'gina@example.com').text, /\/host\/set-password\?token=/);

  // Host adds and edits a property
  assert.equal((await h.req('/api/portal/properties', { method: 'POST', body: { name: '' } })).status, 400);
  assert.equal((await h.req('/api/portal/properties', { method: 'POST', body: { name: 'Loft', address: '1 Butler St', checkout_time: '11am' } })).status, 400);
  const prop = (await h.req('/api/portal/properties', { method: 'POST', body: { name: 'Lawrenceville Loft', address: '3700 Butler St', bedrooms: 2, bathrooms: 1, access_notes: 'Lockbox 4321', checkout_time: '11:00', checkin_time: '16:00' } })).data;
  assert.equal(prop.name, 'Lawrenceville Loft');
  const edited = await h.req(`/api/portal/properties/${prop.id}`, { method: 'PUT', body: { ...prop, notes: 'Extra towels in hall closet' } });
  assert.equal(edited.data.notes, 'Extra towels in hall closet');
  assert.equal((await s.req(`/api/admin/properties?customer_id=${h.customer.id}`)).data.length, 1);

  // Turnover request -> admin alert -> approval creates a property job
  s.sent.length = 0;
  assert.equal((await h.req('/api/portal/turnovers', { method: 'POST', body: { property_id: prop.id, date: '2020-01-01' } })).status, 400);
  const tr = await h.req('/api/portal/turnovers', { method: 'POST', body: { property_id: prop.id, date: '2030-06-10', checkin_time: '15:00', note: 'Guests had a dog' } });
  assert.equal(tr.status, 201);
  assert.equal(tr.data.checkout_time, '11:00'); // property default
  await s.until(() => s.sent.some((m) => m.to === 'owner@example.com'));
  assert.match(s.sent.find((m) => m.to === 'owner@example.com').subject, /Turnover request from Gina Host/);
  const cleaner = (await s.req('/api/admin/employees', { method: 'POST', body: { name: 'Ann Lee', email: 'ann@x.com' } })).data;
  s.sent.length = 0;
  const appr = await s.req(`/api/admin/requests/${tr.data.id}/approve`, { method: 'POST', body: { price: 120, employee_ids: [cleaner.id] } });
  assert.equal(appr.status, 200);
  const job = appr.data.job;
  assert.equal(job.scheduled_at, '2030-06-10T11:00');
  assert.equal(job.property_id, prop.id);
  assert.equal(job.address, '3700 Butler St');
  assert.equal(job.service_type, 'Airbnb / STR Turnover');
  assert.match(job.notes, /checks in at 15:00.*Lockbox 4321.*dog/);
  assert.ok(s.sent.some((m) => m.to === 'ann@x.com'));
  assert.ok(s.sent.some((m) => m.to === 'gina@example.com' && /turnover is booked/.test(m.text)));

  let turnovers = (await h.req('/api/portal/turnovers')).data;
  assert.deepEqual(turnovers.upcoming.map((j) => j.id), [job.id]);
  assert.equal(turnovers.upcoming[0].property.name, 'Lawrenceville Loft');
  assert.deepEqual(turnovers.upcoming[0].cleaners, ['Ann']);
  assert.equal(turnovers.requests[0].status, 'approved');
  const dash = (await h.req('/api/portal/dashboard')).data;
  assert.equal(dash.next_turnover.id, job.id);
  assert.equal(dash.properties, 1);

  // Admin completes the job and writes the report with photos
  await s.req(`/api/admin/jobs/${job.id}`, { method: 'PUT', body: { ...job, employee_ids: [cleaner.id], status: 'completed', scheduled_at: PAST } });
  const rep = await s.req(`/api/admin/jobs/${job.id}/report`, { method: 'PUT', body: { notes: 'All clean, beds made', damage_notes: 'Wine stain on rug', inventory_notes: 'Low on coffee pods' } });
  assert.equal(rep.data.notes, 'All clean, beds made');
  const up = await s.req(`/api/admin/jobs/${job.id}/report/photos`, { method: 'POST', body: { name: 'rug.png', data: PNG } });
  assert.equal(up.status, 201);
  assert.equal(up.data.photos.length, 1);
  assert.equal(up.data.photos[0].type, 'image/png');
  assert.ok(fs.existsSync(path.join(s.config.uploadsDir, 'jobs', String(job.id), up.data.photos[0].file)));
  // Not an image (renamed text file) -> refused; too big -> refused
  const fake = `data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`;
  assert.equal((await s.req(`/api/admin/jobs/${job.id}/report/photos`, { method: 'POST', body: { name: 'x.png', data: fake } })).status, 415);
  const big = Buffer.alloc(9 * 1024 * 1024); big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
  assert.equal((await s.req(`/api/admin/jobs/${job.id}/report/photos`, { method: 'POST', body: { name: 'big.jpg', data: big.toString('base64') } })).status, 413);

  turnovers = (await h.req('/api/portal/turnovers')).data;
  assert.equal(turnovers.past[0].has_report, true);
  const report = (await h.req(`/api/portal/turnovers/${job.id}`)).data;
  assert.equal(report.report.damage_notes, 'Wine stain on rug');
  assert.equal(report.report.inventory_notes, 'Low on coffee pods');
  const img = await h.req(`/api/portal/photos/${job.id}/${report.report.photos[0].file}`);
  assert.equal(img.status, 200);
  assert.equal(img.data.subarray(1, 4).toString(), 'PNG');

  // Delete a photo
  const del = await s.req(`/api/admin/jobs/${job.id}/report/photos/${up.data.photos[0].file}`, { method: 'DELETE' });
  assert.equal(del.data.photos.length, 0);
  assert.equal((await h.req(`/api/portal/photos/${job.id}/${up.data.photos[0].file}`)).status, 404);

  // Admin sees the host's properties, invoices and requests on the client page
  const detail = (await s.req(`/api/admin/customers/${h.customer.id}`)).data;
  assert.equal(detail.portal_account.is_host, 1);
  assert.equal(detail.properties.length, 1);
  assert.equal(detail.requests.length, 1);
});

test('admin portal access: needs an email, invite link, email change follows the client record', async (t) => {
  const s = setup();
  t.after(s.close);
  await s.login();
  const noEmail = (await s.req('/api/admin/customers', { method: 'POST', body: { name: 'No Email' } })).data;
  assert.equal((await s.req(`/api/admin/customers/${noEmail.id}/portal`, { method: 'PUT', body: { enabled: true } })).status, 400);

  const c = (await s.req('/api/admin/customers', { method: 'POST', body: { name: 'Hal Client', email: 'hal@example.com' } })).data;
  const inv = await s.req(`/api/admin/customers/${c.id}/portal/invite`, { method: 'POST', body: {} });
  assert.equal(inv.status, 200);
  assert.equal(inv.data.account.has_password, 0);
  const first = lastLink(s, 'hal@example.com');
  await s.req(`/api/admin/customers/${c.id}/portal/invite`, { method: 'POST', body: {} });
  // Only the newest link works
  assert.equal((await s.session()('/api/portal/set-password', { method: 'POST', body: { token: first, password: 'hal-pass-123' } })).status, 400);

  // Two clients can't share one portal email
  const dup = (await s.req('/api/admin/customers', { method: 'POST', body: { name: 'Hal Twin', email: 'hal2@example.com' } })).data;
  await s.req(`/api/admin/customers/${dup.id}/portal`, { method: 'PUT', body: { enabled: true } });
  assert.equal((await s.req(`/api/admin/customers/${dup.id}`, { method: 'PUT', body: { ...dup, email: 'hal@example.com' } })).status, 409);

  await s.req(`/api/admin/customers/${c.id}`, { method: 'PUT', body: { ...c, email: 'hal.new@example.com' } });
  assert.equal((await s.req(`/api/admin/customers/${c.id}`)).data.portal_account.email, 'hal.new@example.com');
  await s.req(`/api/admin/customers/${c.id}/portal`, { method: 'PUT', body: { enabled: false } });
  assert.equal((await s.req(`/api/admin/customers/${c.id}/portal/invite`, { method: 'POST', body: {} })).status, 400);
});

test('database upgrade: existing jobs table gets property_id without losing data', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'shinepro-migrate-')), 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, phone TEXT, address TEXT, city TEXT, zip TEXT, notes TEXT,
              marketing_opt_in INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
            CREATE TABLE jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE, lead_id INTEGER,
              scheduled_at TEXT NOT NULL, duration_hours REAL NOT NULL DEFAULT 3, address TEXT, service_type TEXT, price REAL, status TEXT NOT NULL DEFAULT 'scheduled',
              notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
            INSERT INTO customers (name) VALUES ('Old Client');
            INSERT INTO jobs (customer_id, scheduled_at) VALUES (1, '2030-01-01T09:00');`);
  old.close();
  const db = openDb(file);
  assert.ok(db.prepare('PRAGMA table_info(jobs)').all().some((c) => c.name === 'property_id'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 1);
  db.close();
  const again = openDb(file); // running it twice is safe
  again.close();
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
});

test('portal pages are served at the URLs the website links to', async (t) => {
  const s = setup();
  t.after(s.close);
  const pages = ['/portal/login', '/portal', '/portal/bookings', '/portal/invoices', '/portal/invoices/12', '/portal/profile', '/portal/register',
    '/portal/forgot', '/portal/set-password', '/host/login', '/host', '/host/properties', '/host/turnovers', '/host/turnovers/3', '/host/invoices', '/host/profile'];
  for (const p of pages) {
    const r = await s.req(p);
    assert.equal(r.status, 200, p);
    assert.match(r.data, /PGH Shine Pro Cleaning Services/, p);
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow', p);
  }
  assert.equal((await s.req('/portal.js')).status, 200);
  assert.equal((await s.req('/portal/nope')).status, 404);
});

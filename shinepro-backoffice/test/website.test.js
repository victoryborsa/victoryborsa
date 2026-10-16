const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

const SITE = 'https://site.example';
const json = (body, origin = SITE) => ({ method: 'POST', body, headers: { Origin: origin } });

test('CORS: the website origins (SITE_ORIGINS) may post to every public endpoint', async (t) => {
  const s = setup({ env: { SITE_ORIGINS: `${SITE},https://www.site.example` } });
  t.after(s.close);
  for (const path of ['/api/leads', '/api/contact', '/api/newsletter', '/api/forms']) {
    const pre = await s.req(path, { method: 'OPTIONS', headers: { Origin: SITE, 'Access-Control-Request-Method': 'POST' } });
    assert.equal(pre.status, 204, path);
    assert.equal(pre.headers.get('access-control-allow-origin'), SITE, path);
    assert.match(pre.headers.get('access-control-allow-methods'), /POST/, path);
    const evil = await s.req(path, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    assert.equal(evil.headers.get('access-control-allow-origin'), null, path);
  }
  const r = await s.req('/api/newsletter', json({ email: 'cors@example.com', consent: true }, 'https://www.site.example'));
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://www.site.example');
  // the default list is the real website
  const d = setup();
  t.after(d.close);
  assert.deepEqual(d.config.siteOrigins, ['https://pghshinepro.com', 'https://www.pghshinepro.com']);
});

test('contact form: saved as a lead, owner alert, customer confirmation, validation, dedupe, honeypot', async (t) => {
  const s = setup({ env: { SITE_ORIGINS: SITE } });
  t.after(s.close);
  const bad = async (body, re) => {
    const r = await s.req('/api/contact', json(body));
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.data.error, re);
  };
  await bad({ name: 'Ann', message: 'Hi' }, /phone number or email/);
  await bad({ name: 'Ann', email: 'ann@example.com' }, /message/);
  await bad({ name: 'Ann', phone: '4125550160', preferred_contact: 'email', message: 'Hi' }, /email address/);
  await bad({ email: 'ann@example.com', message: 'Hi' }, /name/);

  const body = { name: 'Ann Contact', email: 'ann@example.com', preferred_contact: 'email', interest: 'Deep Cleaning', message: 'Do you clean ovens?', request_id: 'contact-req-0001' };
  const r = await s.req('/api/contact', json(body));
  assert.equal(r.status, 201);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.duplicate, false);
  assert.equal(r.headers.get('access-control-allow-origin'), SITE);
  await s.until(() => s.sent.length >= 2);
  const owner = s.sent.find((m) => m.to === 'owner@example.com');
  assert.match(owner.subject, /New website message: Ann Contact/);
  assert.match(owner.text, /Do you clean ovens\?/);
  const confirmation = s.sent.find((m) => m.to === 'ann@example.com');
  assert.match(confirmation.subject, /We got your message/);

  const again = await s.req('/api/contact', json(body));
  assert.equal(again.status, 200);
  assert.equal(again.data.id, r.data.id);
  assert.equal(again.data.duplicate, true);
  const bot = await s.req('/api/contact', json({ ...body, request_id: 'contact-req-0002', company_website: 'spam.biz' }));
  assert.equal(bot.status, 200);
  await s.until(() => false);
  assert.equal(s.sent.length, 2);

  await s.login();
  const leads = (await s.req('/api/admin/leads')).data;
  assert.equal(leads.length, 1);
  assert.equal(leads[0].source, 'contact');
  assert.equal(leads[0].estimated_price, null); // a contact message is never priced
  assert.equal(leads[0].preferred_contact, 'email');
  assert.equal(leads[0].marketing_opt_in, 0);
});

test('newsletter needs consent and is the only thing besides the marketing box that opts someone in', async (t) => {
  const s = setup({ env: { SITE_ORIGINS: SITE } });
  t.after(s.close);
  assert.equal((await s.req('/api/newsletter', json({ email: 'news@example.com' }))).status, 400);
  const noConsent = await s.req('/api/newsletter', json({ email: 'news@example.com', consent: false }));
  assert.equal(noConsent.status, 400);
  assert.match(noConsent.data.error, /tick the box/);
  assert.equal((await s.req('/api/newsletter', json({ email: 'not-an-email', consent: true }))).status, 400);

  // An estimate request without the marketing box does not opt in...
  await s.req('/api/leads', json({ name: 'Lee', email: 'news@example.com', service_type: 'deep', bedrooms: 2 }));
  await s.req('/api/leads', json({ name: 'Mo', email: 'mo@example.com', service_type: 'deep', bedrooms: 2, marketing_opt_in: true }));
  await s.login();
  let customers = (await s.req('/api/admin/customers')).data;
  assert.equal(customers.find((c) => c.email === 'news@example.com').marketing_opt_in, 0);
  assert.equal(customers.find((c) => c.email === 'mo@example.com').marketing_opt_in, 1);

  // ...the newsletter does, on the same client record
  const r = await s.req('/api/newsletter', json({ email: 'News@Example.com', consent: true, request_id: 'news-0001' }));
  assert.equal(r.status, 201);
  assert.equal(r.data.duplicate, false);
  const again = await s.req('/api/newsletter', json({ email: 'news@example.com', consent: true, request_id: 'news-0001' }));
  assert.equal(again.status, 200);
  assert.equal(again.data.duplicate, true);
  assert.equal(again.data.id, r.data.id);
  customers = (await s.req('/api/admin/customers')).data;
  const lee = customers.find((c) => c.email === 'news@example.com');
  assert.equal(lee.marketing_opt_in, 1);
  assert.ok(lee.marketing_opt_in_at);
  assert.equal(customers.length, 2);
  // A brand-new email becomes a client with marketing on
  await s.req('/api/newsletter', json({ email: 'fresh@example.com', consent: true }));
  const fresh = (await s.req('/api/admin/customers?q=fresh')).data[0];
  assert.equal(fresh.marketing_opt_in, 1);
  assert.equal(fresh.source, 'newsletter');
});

test('website forms: saved with their fields, owner alert, admin list with read/unread, validation, dedupe', async (t) => {
  const s = setup({ env: { SITE_ORIGINS: SITE } });
  t.after(s.close);
  const bad = async (body, re) => {
    const r = await s.req('/api/forms', json(body));
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.data.error, re);
  };
  await bad({ name: 'Gia', email: 'gia@example.com', fields: {} }, /form name/);
  await bad({ form: 'Careers', name: 'Gia', fields: { Experience: '3 years' } }, /phone number or email/);
  await bad({ form: 'Careers', email: 'gia@example.com', fields: 'nope' }, /named fields/);
  await bad({ form: 'Careers', email: 'gia@example.com', fields: { 'Cover letter': 'x'.repeat(5001) } }, /too long/);
  const many = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`Field ${i}`, 'yes']));
  await bad({ form: 'Careers', email: 'gia@example.com', fields: many }, /Too many fields/);

  const body = { form: 'Careers', name: 'Gia Applicant', email: 'gia@example.com', phone: '412-555-0161', preferred_contact: 'text',
    request_id: 'form-0001', fields: { Position: 'Cleaner', 'Days available': ['Mon', 'Wed'], Experience: '3 years' } };
  const r = await s.req('/api/forms', json(body));
  assert.equal(r.status, 201);
  assert.equal(r.data.duplicate, false);
  const again = await s.req('/api/forms', json(body));
  assert.equal(again.status, 200);
  assert.equal(again.data.id, r.data.id);
  assert.equal(again.data.duplicate, true);
  // Same person, same answers, no request_id, within 2 minutes: still one submission
  const { request_id, ...noId } = body; // eslint-disable-line no-unused-vars
  assert.equal((await s.req('/api/forms', json(noId))).data.id, r.data.id);
  const gift = await s.req('/api/forms', json({ form: 'Gift card', name: 'Hal', email: 'hal@example.com', fields: { Amount: '$100', 'Recipient name': 'Ida' } }));
  assert.equal(gift.status, 201);

  await s.until(() => s.sent.filter((m) => m.to === 'owner@example.com').length >= 2);
  const alert = s.sent.find((m) => m.to === 'owner@example.com' && /Careers/.test(m.subject));
  assert.match(alert.subject, /New website form: Careers from Gia Applicant/);
  assert.match(alert.text, /Days available: Mon, Wed/);
  assert.equal(s.sent.filter((m) => /Careers/.test(m.subject || '')).length, 1);

  await s.login();
  assert.equal((await s.req('/api/admin/stats')).data.unread_forms, 2);
  const list = (await s.req('/api/admin/forms?status=unread')).data;
  assert.equal(list.length, 2);
  const careers = list.find((f) => f.form === 'Careers');
  assert.deepEqual(careers.fields, { Position: 'Cleaner', 'Days available': 'Mon, Wed', Experience: '3 years' });
  assert.equal(careers.phone, '+14125550161');
  assert.equal(careers.preferred_contact, 'text');
  const detail = (await s.req(`/api/admin/forms/${careers.id}`)).data;
  assert.equal(detail.notifications[0].status, 'sent');
  const read = await s.req(`/api/admin/forms/${careers.id}`, { method: 'PATCH', body: { read: true } });
  assert.ok(read.data.read_at);
  assert.equal((await s.req('/api/admin/stats')).data.unread_forms, 1);
  assert.equal((await s.req('/api/admin/forms?status=unread')).data.length, 1);
  await s.req(`/api/admin/forms/${careers.id}`, { method: 'PATCH', body: { read: false } });
  assert.equal((await s.req('/api/admin/stats')).data.unread_forms, 2);
  assert.equal((await s.req(`/api/admin/forms/${gift.data.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await s.req('/api/admin/forms')).data.length, 1);
  // The admin list needs the admin login
  assert.equal((await s.session()('/api/admin/forms')).status, 401);
});

test('notifications: failed sends retry automatically (3 attempts, no duplicates) and are logged', async (t) => {
  // The owner alert fails twice, then works. The customer confirmation works the first time.
  const s = setup({ smsEnabled: false, failEmail: (m, n) => m.to === 'owner@example.com' && n <= 2 });
  t.after(s.close);
  const r = await s.req('/api/leads', { method: 'POST', body: { name: 'Retry Ray', email: 'ray@example.com', service_type: 'deep', bedrooms: 2 } });
  await s.until(() => s.sent.some((m) => m.to === 'owner@example.com'));
  await s.until(() => false);
  assert.equal(s.attempts.filter((m) => m.to === 'owner@example.com').length, 3);
  assert.equal(s.sent.filter((m) => m.to === 'owner@example.com').length, 1);
  assert.equal(s.sent.filter((m) => m.to === 'ray@example.com').length, 1);
  await s.login();
  const lead = (await s.req(`/api/admin/leads/${r.data.id}`)).data;
  assert.equal(lead.admin_notified, 1);
  const owner = lead.notifications.find((n) => n.recipient === 'owner@example.com');
  assert.equal(owner.status, 'sent');
  assert.equal(owner.attempts, 3);
  assert.equal(lead.notifications.find((n) => n.recipient === 'ray@example.com').attempts, 1);
  assert.equal((await s.req(`/api/admin/notifications/${owner.id}/retry`, { method: 'POST', body: {} })).status, 409); // already sent
});

test('notifications: admin Retry resends a failed one once', async (t) => {
  let down = true;
  const s = setup({ smsEnabled: false, failEmail: (m) => down && m.to === 'owner@example.com' });
  t.after(s.close);
  const r = await s.req('/api/leads', { method: 'POST', body: { name: 'Down Dee', phone: '4125550162', service_type: 'standard', bedrooms: 1 } });
  await s.until(() => false);
  await s.login();
  let lead = (await s.req(`/api/admin/leads/${r.data.id}`)).data;
  const failed = lead.notifications.find((n) => n.recipient === 'owner@example.com');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.attempts, 3);
  assert.equal(failed.error, 'SMTP down');
  assert.equal(lead.admin_notified, 0);
  assert.equal((await s.req('/api/admin/notifications?status=failed')).data.length, 1);

  const stillDown = await s.req(`/api/admin/notifications/${failed.id}/retry`, { method: 'POST', body: {} });
  assert.equal(stillDown.status, 502);
  assert.equal(stillDown.data.notification.attempts, 4);
  down = false;
  const ok = await s.req(`/api/admin/notifications/${failed.id}/retry`, { method: 'POST', body: {} });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.notification.status, 'sent');
  const owner = s.sent.filter((m) => m.to === 'owner@example.com');
  assert.equal(owner.length, 1);
  assert.match(owner[0].text, /Travel Fee — \$25/);
  assert.equal((await s.req(`/api/admin/notifications/${failed.id}/retry`, { method: 'POST', body: {} })).status, 409);
  assert.equal(s.sent.filter((m) => m.to === 'owner@example.com').length, 1);
  lead = (await s.req(`/api/admin/leads/${r.data.id}`)).data;
  assert.equal(lead.admin_notified, 1);
  assert.equal((await s.req('/api/admin/notifications/9999/retry', { method: 'POST', body: {} })).status, 404);
});

test('booking from a lead carries the estimate; its invoice has the lines and exactly one travel fee', async (t) => {
  const s = setup();
  t.after(s.close);
  const { data: lead } = await s.req('/api/leads', { method: 'POST', body: { name: 'Ivy Inv', email: 'ivy@example.com', service_type: 'deep', bedrooms: 2, addons: ['fridge', 'laundry'] } });
  assert.equal(lead.estimated_price, 359); // 309 + fridge included + laundry 25 + travel 25 (no ZIP)
  await s.login();
  const customerId = (await s.req(`/api/admin/leads/${lead.id}`)).data.customer_id;
  const job = (await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: customerId, lead_id: lead.id, scheduled_at: '2030-06-01T09:00' } })).data;
  assert.equal(job.price, 359);
  assert.equal(job.service_type, 'Deep Cleaning');
  assert.equal(job.price_breakdown.total, 359);
  assert.equal(job.price_breakdown.lines.filter((l) => l.kind === 'travel').length, 1);

  const prefill = (await s.req(`/api/admin/invoices/prefill?job_id=${job.id}`)).data;
  assert.equal(prefill.items.filter((i) => i.kind === 'travel').length, 1);
  const inv = (await s.req('/api/admin/invoices', { method: 'POST', body: { job_id: job.id } })).data;
  assert.equal(inv.amount, 359);
  assert.deepEqual(inv.items.map((i) => [i.description, i.amount]), [
    ['Deep Cleaning — 2 Bedrooms', 309], ['Inside refrigerator — included', 0], ['One laundry load', 25], ['Travel Fee — $25', 25],
  ]);

  // The travel fee can't be added twice, and its amount always comes from pricing.js
  const twice = await s.req(`/api/admin/invoices/${inv.id}`, { method: 'PUT', body: { items: [...inv.items, { description: 'Travel fee', amount: 20 }] } });
  assert.equal(twice.status, 400);
  assert.match(twice.data.error, /once per visit/);
  const edited = (await s.req(`/api/admin/invoices/${inv.id}`, { method: 'PUT', body: { items: [
    { description: 'Deep Cleaning — 2 Bedrooms', amount: 309, kind: 'service' }, { description: 'Extra: balcony', amount: 45 },
    { description: 'Travel Fee', amount: 99, kind: 'travel' },
  ] } })).data;
  assert.equal(edited.amount, 379); // 309 + 45 + 25 (not 99)
  assert.equal(edited.items[2].description, 'Travel Fee — $25');
  assert.equal(edited.items[2].amount, 25);
  // A $0 travel line stays free (home within 5 miles)
  const free = (await s.req(`/api/admin/invoices/${inv.id}`, { method: 'PUT', body: { items: [
    { description: 'Deep Cleaning — 2 Bedrooms', amount: 309, kind: 'service' }, { description: 'Travel Fee', amount: 0, kind: 'travel' },
  ] } })).data;
  assert.equal(free.amount, 309);
  assert.equal(free.items[1].description, 'Travel Fee — free within 5 miles');
  await s.req(`/api/admin/invoices/${inv.id}`, { method: 'PUT', body: { items: edited.items } });
  // Changing only the amount of a several-line invoice is refused (the lines decide the total)
  assert.equal((await s.req(`/api/admin/invoices/${inv.id}`, { method: 'PUT', body: { amount: 10 } })).status, 400);

  // A job priced by hand (no estimate): one service line + one travel fee line
  const manual = (await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: customerId, scheduled_at: '2030-06-08T09:00', price: 238, service_type: 'Deep Cleaning' } })).data;
  const inv2 = (await s.req('/api/admin/invoices', { method: 'POST', body: { job_id: manual.id } })).data;
  assert.equal(inv2.amount, 238);
  assert.deepEqual(inv2.items.map((i) => [i.kind, i.amount]), [['service', 213], ['travel', 25]]);

  // Client portal and email show every line and the total
  await s.req(`/api/admin/customers/${customerId}/portal`, { method: 'PUT', body: { enabled: true, send_link: true } });
  const token = /token=([\w-]+)/.exec([...s.sent].reverse().find((m) => m.to === 'ivy@example.com' && /set-password/.test(m.text)).text)[1];
  const client = s.session();
  await client('/api/portal/set-password', { method: 'POST', body: { token, password: 'client-pass-1' } });
  s.sent.length = 0;
  await s.req(`/api/admin/invoices/${inv.id}/send`, { method: 'POST', body: {} });
  const mail = s.sent.find((m) => m.to === 'ivy@example.com');
  assert.match(mail.text, /Extra: balcony: \$45\.00/);
  assert.match(mail.text, /Travel Fee — \$25: \$25\.00/);
  assert.match(mail.text, /Total: \$379\.00/);
  const view = (await client(`/api/portal/invoices/${inv.id}`)).data;
  assert.equal(view.items.length, 3);
  assert.equal(view.amount, 379);
});

test('old invoices without line items still show as one line', async (t) => {
  const s = setup();
  t.after(s.close);
  await s.login();
  const c = (await s.req('/api/admin/customers', { method: 'POST', body: { name: 'Old Inv', email: 'old@example.com' } })).data;
  s.app.locals.db.prepare(`INSERT INTO invoices (customer_id, number, amount, status) VALUES (?, 'SP-OLD', 150, 'sent')`).run(c.id);
  const list = (await s.req('/api/admin/invoices')).data;
  assert.deepEqual(list[0].items.map((i) => [i.description, i.amount]), [['Cleaning services', 150]]);
  // Changing only the amount of a one-line invoice keeps the line in step
  const upd = (await s.req(`/api/admin/invoices/${list[0].id}`, { method: 'PUT', body: { amount: 175 } })).data;
  assert.equal(upd.amount, 175);
  assert.equal(upd.items[0].amount, 175);
  const blank = (await s.req('/api/admin/invoices', { method: 'POST', body: { customer_id: c.id, amount: 45.5 } })).data;
  assert.deepEqual(blank.items.map((i) => i.amount), [45.5]);
});

test('assigning a cleaner who already has an overlapping job warns but still saves', async (t) => {
  const s = setup({ smsEnabled: false });
  t.after(s.close);
  await s.login();
  const c = (await s.req('/api/admin/customers', { method: 'POST', body: { name: 'Busy Client', phone: '4125550163' } })).data;
  const e = (await s.req('/api/admin/employees', { method: 'POST', body: { name: 'Olga Busy' } })).data;
  const other = (await s.req('/api/admin/employees', { method: 'POST', body: { name: 'Pat Free' } })).data;
  const first = await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: c.id, scheduled_at: '2030-07-01T09:00', duration_hours: 3, employee_ids: [e.id] } });
  assert.deepEqual(first.data.warnings, []);

  const clash = await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: c.id, scheduled_at: '2030-07-01T11:00', duration_hours: 2, employee_ids: [e.id, other.id] } });
  assert.equal(clash.status, 201); // not blocked
  assert.equal(clash.data.warnings.length, 1);
  assert.equal(clash.data.warnings[0].employee_id, e.id);
  assert.equal(clash.data.warnings[0].job_id, first.data.id);
  assert.match(clash.data.warnings[0].message, /Olga Busy already has a job/);

  // Back to back is fine; a cancelled job doesn't count; the job itself doesn't count when edited
  const later = await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: c.id, scheduled_at: '2030-07-01T13:00', employee_ids: [e.id] } });
  assert.deepEqual(later.data.warnings, []);
  const edit = await s.req(`/api/admin/jobs/${first.data.id}`, { method: 'PUT', body: { ...first.data, employee_ids: [e.id] } });
  assert.equal(edit.data.warnings.length, 1); // still overlaps the 11:00 job
  await s.req(`/api/admin/jobs/${clash.data.id}`, { method: 'PUT', body: { ...clash.data, status: 'cancelled', employee_ids: [e.id, other.id] } });
  const check = await s.req(`/api/admin/jobs/conflicts?employee_ids=${e.id}&scheduled_at=2030-07-01T10:00&duration_hours=1`);
  assert.deepEqual(check.data.map((w) => w.job_id), [first.data.id]);
  const checkSelf = await s.req(`/api/admin/jobs/conflicts?employee_ids=${e.id}&scheduled_at=2030-07-01T10:00&duration_hours=1&job_id=${first.data.id}`);
  assert.deepEqual(checkSelf.data, []);
  // Overnight overlap across midnight is caught too
  await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: c.id, scheduled_at: '2030-07-02T23:00', duration_hours: 3, employee_ids: [other.id] } });
  const early = await s.req(`/api/admin/jobs/conflicts?employee_ids=${other.id}&scheduled_at=2030-07-03T01:00&duration_hours=1`);
  assert.equal(early.data.length, 1);
});

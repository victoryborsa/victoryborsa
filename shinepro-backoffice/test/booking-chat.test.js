const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');
const { fmtLocal } = require('../src/util');

const pause = () => new Promise((r) => setTimeout(r, 1100)); // the chat allows one message a second
const bookingEmails = (s, to) => s.sent.filter((m) => m.channel === 'email' && m.to === to && /booked|New time|cancelled/.test(m.subject));

test('wall-clock times are written the same on any server time zone', () => {
  assert.equal(fmtLocal('2030-05-01T09:00'), 'Wed, May 1, 9:00 AM');
  assert.equal(fmtLocal('2030-05-01T15:30'), 'Wed, May 1, 3:30 PM');
  assert.equal(fmtLocal('2030-05-01'), 'Wed, May 1'); // a date alone has no time and never slips to the day before
});

test('quick booking: a new client is created and emailed a confirmation right away', async (t) => {
  const s = setup();
  t.after(s.close);
  await s.login();
  const cleaner = (await s.req('/api/admin/employees', { method: 'POST', body: { name: 'Maria Lopez', email: 'maria@x.com' } })).data;
  const res = await s.req('/api/admin/jobs', {
    method: 'POST',
    body: {
      customer_id: '', new_customer: { name: 'Pat Smith', phone: '412-555-0177', email: 'pat@example.com', address: '5 Elm St, Pittsburgh' },
      scheduled_at: '2030-05-01T09:00', duration_hours: 3, service_type: 'Deep Cleaning', price: 329, employee_ids: [cleaner.id], notify_customer: true,
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.customer.name, 'Pat Smith');
  assert.equal(res.data.address, '5 Elm St, Pittsburgh');
  assert.equal(res.data.customer_notification.ok, true);
  assert.equal(res.data.customer_notification.to, 'pat@example.com');

  const [mail] = bookingEmails(s, 'pat@example.com');
  assert.match(mail.subject, /You're booked: Wed, May 1, 9:00 AM/);
  assert.match(mail.text, /Hi Pat/);
  assert.match(mail.text, /When: Wednesday, May 1 at 9:00 AM \(about 3 hours\)/);
  assert.match(mail.text, /Where: 5 Elm St, Pittsburgh/);
  assert.match(mail.text, /Price: \$329/);
  assert.match(mail.text, /Your cleaner: Maria/);
  assert.doesNotMatch(mail.text, /maria@x\.com/); // staff contact details stay private

  // It's in the client's conversation and the email log.
  const client = (await s.req(`/api/admin/customers/${res.data.customer_id}`)).data;
  assert.ok(client.messages.some((m) => m.direction === 'out' && /You're booked/.test(m.subject)));
  assert.ok((await s.req('/api/admin/notifications')).data.some((n) => n.kind === 'booking_booked' && n.status === 'sent'));

  // Booking the same person again by phone reuses their client record.
  const again = await s.req('/api/admin/jobs', { method: 'POST', body: { new_customer: { name: 'Pat S', phone: '(412) 555-0177' }, scheduled_at: '2030-06-01T09:00' } });
  assert.equal(again.data.customer_id, res.data.customer_id);
  assert.equal((await s.req('/api/admin/customers')).data.length, 1);
  assert.equal(again.data.customer_notification, undefined); // not ticked: no email

  // A new client needs a way to reach them.
  const bad = await s.req('/api/admin/jobs', { method: 'POST', body: { new_customer: { name: 'Nobody' }, scheduled_at: '2030-06-01T09:00' } });
  assert.equal(bad.status, 400);
});

test('moving or cancelling a booking emails the client; other edits do not', async (t) => {
  const s = setup();
  t.after(s.close);
  await s.login();
  const c = (await s.req('/api/admin/customers', { method: 'POST', body: { name: 'Lee Park', email: 'lee@example.com', address: '9 Oak Ave' } })).data;
  const job = (await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: c.id, scheduled_at: '2030-05-01T09:00', notify_customer: true } })).data;
  assert.equal(job.address, '9 Oak Ave');
  assert.equal(bookingEmails(s, 'lee@example.com').length, 1);

  // Only the notes change: no email. A blank address keeps the old one.
  const notes = await s.req(`/api/admin/jobs/${job.id}`, { method: 'PUT', body: { ...job, address: '', notes: 'Bring ladder', employee_ids: [], notify_customer: true } });
  assert.equal(notes.data.customer_notification, undefined);
  assert.equal(notes.data.address, '9 Oak Ave');

  const moved = await s.req(`/api/admin/jobs/${job.id}`, { method: 'PUT', body: { ...job, scheduled_at: '2030-05-02T13:00', employee_ids: [], notify_customer: true } });
  assert.equal(moved.data.customer_notification.ok, true);
  assert.match(bookingEmails(s, 'lee@example.com').at(-1).subject, /New time for your cleaning: Thu, May 2, 1:00 PM/);

  const cancelled = await s.req(`/api/admin/jobs/${job.id}`, { method: 'PUT', body: { ...moved.data, status: 'cancelled', employee_ids: [], notify_customer: true } });
  assert.equal(cancelled.data.customer_notification.ok, true);
  assert.match(bookingEmails(s, 'lee@example.com').at(-1).subject, /cancelled/);
  assert.equal(bookingEmails(s, 'lee@example.com').length, 3);

  // No email address: the booking is saved and the admin is told why no email went out.
  const noEmail = (await s.req('/api/admin/customers', { method: 'POST', body: { name: 'No Mail', phone: '4125550100' } })).data;
  const j2 = await s.req('/api/admin/jobs', { method: 'POST', body: { customer_id: noEmail.id, scheduled_at: '2030-05-03T09:00', notify_customer: true } });
  assert.equal(j2.status, 201);
  assert.equal(j2.data.customer_notification.status, 'skipped');
  assert.match(j2.data.customer_notification.error, /no email/);
});

test('two-way website chat: replies reach the customer, the AI steps aside, unread chats show in the admin', async (t) => {
  const aiCalls = [];
  const s = setup({ ai: async (history) => { aiCalls.push(history); return 'Our deep clean starts at $249.'; } });
  t.after(s.close);
  const customer = s.session();
  const started = await customer('/api/chat/start', { method: 'POST', body: { name: 'Jane Doe', email: 'jane@example.com', phone: '412-555-0199' } });
  assert.equal(started.status, 201);
  const auth = { Authorization: `Bearer ${started.data.token}` };
  const leadId = (await (async () => { await s.login(); return (await s.req('/api/admin/chats')).data[0].lead_id; })());

  // The customer asks something; the AI answers while nobody from the team is chatting.
  await customer('/api/chat/message', { method: 'POST', headers: auth, body: { message: 'How much is a deep clean?' } });
  assert.equal(aiCalls.length, 1);
  let list = (await s.req('/api/admin/chats')).data;
  assert.equal(list[0].unread, 1);
  assert.equal(list[0].online, true); // their chat just checked in
  assert.equal((await s.req('/api/admin/stats')).data.unread_chats, 1);

  // Opening the chat marks it read.
  const open = (await s.req(`/api/admin/chats/${leadId}`)).data;
  assert.ok(open.messages.some((m) => m.body === 'Our deep clean starts at $249.'));
  assert.equal((await s.req('/api/admin/stats')).data.unread_chats, 0);

  // You reply while they're on the website: it shows in their chat, no email.
  s.sent.length = 0;
  const reply = await s.req(`/api/admin/leads/${leadId}/messages`, { method: 'POST', body: { channel: 'chat', body: 'Hi Jane, this is Victory. Tuesday works?' } });
  assert.equal(reply.status, 201);
  assert.equal(reply.data.emailed, undefined);
  assert.equal(s.sent.filter((m) => m.to === 'jane@example.com').length, 0);
  const theirs = (await customer('/api/chat/messages?after=0', { headers: auth })).data;
  assert.ok(theirs.some((m) => m.body === 'Hi Jane, this is Victory. Tuesday works?'));
  assert.equal((await s.req(`/api/admin/leads/${leadId}`)).data.status, 'contacted');

  // Now they answer: the AI stays quiet and the owner gets one email (not one per message).
  s.sent.length = 0;
  await pause();
  const answer = await customer('/api/chat/message', { method: 'POST', headers: auth, body: { message: 'Yes, Tuesday at 10 is great' } });
  assert.equal(answer.status, 200);
  assert.equal(answer.data.messages.length, 1);
  await pause();
  await customer('/api/chat/message?stream=1', { method: 'POST', headers: auth, body: { message: 'Thanks!' } }).catch(() => {});
  assert.equal(aiCalls.length, 1);
  await s.until(() => s.sent.some((m) => m.to === 'owner@example.com'));
  assert.equal(s.sent.filter((m) => m.to === 'owner@example.com' && /replied in the website chat/.test(m.subject)).length, 1);
  assert.equal((await s.req('/api/admin/chats')).data[0].you_are_chatting, true);

  // Hand back to the assistant: it answers again.
  await s.req(`/api/admin/chats/${leadId}/assistant`, { method: 'POST', body: {} });
  await pause();
  await customer('/api/chat/message', { method: 'POST', headers: auth, body: { message: 'Do you bring supplies?' } });
  assert.equal(aiCalls.length, 2);
});

test('a chat reply to a customer who left the website is emailed to them too', async (t) => {
  const s = setup();
  t.after(s.close);
  const started = await s.session()('/api/chat/start', { method: 'POST', body: { name: 'Sam Ray', email: 'sam@example.com', phone: '412-555-0123' } });
  assert.equal(started.status, 201);
  await s.login();
  const leadId = (await s.req('/api/admin/chats')).data[0].lead_id;
  const reply = await s.req(`/api/admin/leads/${leadId}/messages`, { method: 'POST', body: { channel: 'chat', body: 'Sorry we missed you! We have Friday open.' } });
  assert.equal(reply.data.emailed, true);
  const mail = s.sent.find((m) => m.to === 'sam@example.com');
  assert.match(mail.subject, /replied to your chat/);
  assert.match(mail.text, /We have Friday open/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { setup } = require('./helpers');
const { createPhoneVerifier } = require('../src/firebase');

// A fake Firebase: our own RSA key stands in for Google's signing key.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PROJECT = 'shinepro-test';
const verifyPhoneToken = createPhoneVerifier({
  projectId: PROJECT,
  fetchCerts: async () => ({ certs: { k1: publicKey.export({ type: 'spki', format: 'pem' }) }, expiresAt: Date.now() + 3600e3 }),
});
function firebaseToken(claims = {}, { kid = 'k1', key = privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = { aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: 'uid1', iat: now, auth_time: now, exp: now + 3600, phone_number: '+14125550199', ...claims };
  const unsigned = `${enc({ alg: 'RS256', kid })}.${enc(body)}`;
  return `${unsigned}.${crypto.sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url')}`;
}

const person = { name: 'Jane Doe', email: 'jane@example.com', phone: '(412) 555-0199' };

function chatSetup(opts = {}) {
  const aiCalls = [];
  const s = setup({
    verifyPhoneToken,
    ai: opts.noAi ? null : async (messages) => { aiCalls.push(messages); return 'A standard clean for 2 bed / 1 bath is about $200.'; },
    ...opts,
    env: { CHAT_VERIFICATION: 'codes', ...opts.env },
  });
  const codeFor = (email) => {
    const m = [...s.sent].reverse().find((x) => x.to === email && /verification code/.test(x.subject || ''));
    return m && /(\d{6}) is your/.exec(m.subject)[1];
  };
  const start = async (extra = {}) => {
    await s.req('/api/chat/email-code', { method: 'POST', body: { email: person.email } });
    return s.req('/api/chat/start', { method: 'POST', body: { ...person, email_code: codeFor(person.email), phone_token: firebaseToken(), ...extra } });
  };
  return { ...s, aiCalls, codeFor, start };
}

test('phone token verifier enforces Google/Firebase rules', async () => {
  assert.equal(await verifyPhoneToken(firebaseToken()), '+14125550199');
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  await assert.rejects(verifyPhoneToken(firebaseToken({}, { key: other })), /signature/);
  await assert.rejects(verifyPhoneToken(firebaseToken({ aud: 'someone-else' })), /different project/);
  await assert.rejects(verifyPhoneToken(firebaseToken({ exp: Math.floor(Date.now() / 1000) - 10 })), /expired/);
  await assert.rejects(verifyPhoneToken(firebaseToken({ phone_number: undefined })), /phone/);
  await assert.rejects(verifyPhoneToken(firebaseToken({}, { kid: 'nope' })), /signing key/);
  await assert.rejects(verifyPhoneToken('garbage'), /Malformed/);
});

test('chat requires a verified email code AND a verified phone', async (t) => {
  const s = chatSetup();
  t.after(s.close);
  const cfg = (await s.req('/api/chat/config', { headers: { Origin: 'https://pghshinepro.com' } }));
  assert.equal(cfg.data.enabled, true);
  assert.equal(cfg.data.phoneVerification, true);
  assert.equal(cfg.headers.get('access-control-allow-origin'), 'https://pghshinepro.com');

  await s.req('/api/chat/email-code', { method: 'POST', body: { email: person.email } });
  const code = s.codeFor(person.email);
  assert.match(code, /^\d{6}$/);

  const wrongEmailCode = await s.req('/api/chat/start', { method: 'POST', body: { ...person, email_code: '000000' === code ? '111111' : '000000', phone_token: firebaseToken() } });
  assert.equal(wrongEmailCode.status, 400);
  const noPhone = await s.req('/api/chat/start', { method: 'POST', body: { ...person, email_code: code } });
  assert.equal(noPhone.status, 400);
  const otherPhone = await s.req('/api/chat/start', { method: 'POST', body: { ...person, email_code: code, phone_token: firebaseToken({ phone_number: '+14125550000' }) } });
  assert.equal(otherPhone.status, 400);
  assert.match(otherPhone.data.error, /does not match/);

  const ok = await s.req('/api/chat/start', { method: 'POST', body: { ...person, email_code: code, phone_token: firebaseToken() } });
  assert.equal(ok.status, 201);
  assert.ok(ok.data.token);
  assert.match(ok.data.messages[0].body, /Thanks, Jane!/);
  // A code can only be used once
  const reuse = await s.req('/api/chat/start', { method: 'POST', body: { ...person, email_code: code, phone_token: firebaseToken() } });
  assert.equal(reuse.status, 400);

  // Owner is alerted; customer + lead saved as verified
  await s.until(() => s.sent.some((m) => /New verified website chat/.test(m.subject || '')));
  await s.login();
  const leads = (await s.req('/api/admin/leads')).data;
  assert.equal(leads.length, 1);
  assert.equal(leads[0].source, 'chat');
  assert.equal(leads[0].has_chat, 1);
  assert.equal(leads[0].phone, '+14125550199');
});

test('wrong email codes lock out after 5 attempts; codes are rate limited', async (t) => {
  const s = chatSetup();
  t.after(s.close);
  await s.req('/api/chat/email-code', { method: 'POST', body: { email: person.email } });
  for (let i = 0; i < 5; i++) {
    await s.req('/api/chat/start', { method: 'POST', body: { ...person, email_code: 'abcdef', phone_token: firebaseToken() } });
  }
  const locked = await s.req('/api/chat/start', { method: 'POST', body: { ...person, email_code: s.codeFor(person.email), phone_token: firebaseToken() } });
  assert.equal(locked.status, 400);
  assert.match(locked.data.error, /Too many wrong codes/);
  for (let i = 0; i < 4; i++) await s.req('/api/chat/email-code', { method: 'POST', body: { email: person.email } });
  assert.equal((await s.req('/api/chat/email-code', { method: 'POST', body: { email: person.email } })).status, 429);
  assert.equal((await s.req('/api/chat/email-code', { method: 'POST', body: { email: 'not-an-email' } })).status, 400);
});

test('AI answers questions using the conversation history', async (t) => {
  const s = chatSetup();
  t.after(s.close);
  const { data: session } = await s.start();
  const auth = { Authorization: `Bearer ${session.token}` };
  assert.equal((await s.req('/api/chat/message', { method: 'POST', body: { message: 'hi' } })).status, 401);
  const r = await s.req('/api/chat/message', { method: 'POST', body: { message: 'How much for 2 bed 1 bath?' }, headers: auth });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.messages.map((m) => m.direction), ['in', 'out']);
  assert.match(r.data.messages[1].body, /\$200/);
  // History starts with the customer's turn (greeting is skipped) and alternates
  assert.deepEqual(s.aiCalls[0], [{ role: 'user', content: 'How much for 2 bed 1 bath?' }]);
  await new Promise((res) => setTimeout(res, 1600));
  await s.req('/api/chat/message', { method: 'POST', body: { message: 'Do you bring supplies?' }, headers: auth });
  assert.deepEqual(s.aiCalls[1].map((m) => m.role), ['user', 'assistant', 'user']);
  // Too fast = rate limited
  assert.equal((await s.req('/api/chat/message', { method: 'POST', body: { message: 'again' }, headers: auth })).status, 429);
});

test('without AI, an unknown question gets a polite reply and the owner is emailed the question', async (t) => {
  const s = chatSetup({ noAi: true });
  t.after(s.close);
  const { data: session } = await s.start();
  const r = await s.req('/api/chat/message', { method: 'POST', body: { message: 'Do you sell gift certificates?' }, headers: { Authorization: `Bearer ${session.token}` } });
  assert.match(r.data.messages[1].body, /team member will reply shortly.*\(412\) 447-8047/);
  await s.until(() => s.sent.some((m) => /needs a reply/.test(m.subject || '')));
  assert.ok(s.sent.some((m) => /needs a reply/.test(m.subject || '') && m.text.includes('Do you sell gift certificates?')));
});

test('call-back request: note saved, lead flagged, owner alerted; admin can reply into the chat', async (t) => {
  const s = chatSetup();
  t.after(s.close);
  const { data: session } = await s.start();
  const auth = { Authorization: `Bearer ${session.token}` };
  assert.equal((await s.req('/api/chat/callback', { method: 'POST', body: { note: '' }, headers: auth })).status, 400);
  const cb = await s.req('/api/chat/callback', { method: 'POST', body: { note: 'Need a deep clean Friday', best_time: 'after 5pm' }, headers: auth });
  assert.equal(cb.status, 200);
  assert.match(cb.data.messages[1].body, /\(412\) 555-0199/);
  const alert = s.sent.find((m) => /CALL BACK REQUESTED/.test(m.subject || ''));
  assert.ok(alert && alert.text.includes('Need a deep clean Friday') && alert.text.includes('after 5pm'));

  await s.login();
  const stats = (await s.req('/api/admin/stats')).data;
  assert.equal(stats.callbacks, 1);
  const lead = (await s.req('/api/admin/leads')).data[0];
  assert.equal(lead.callback_requested, 1);

  const reply = await s.req(`/api/admin/leads/${lead.id}/messages`, { method: 'POST', body: { channel: 'chat', body: 'Hi Jane, calling you in 10 minutes!' } });
  assert.equal(reply.status, 201);
  const after = cb.data.messages[1].id;
  const polled = await s.req(`/api/chat/messages?after=${after}`, { headers: auth });
  assert.deepEqual(polled.data.map((m) => [m.body, m.status]), [['Hi Jane, calling you in 10 minutes!', 'sent']]);

  // Admin can't "chat" a lead that never used the chat
  const { data: other } = await s.req('/api/leads', { method: 'POST', body: { name: 'Bob', phone: '4125550123' } });
  assert.equal((await s.req(`/api/admin/leads/${other.id}/messages`, { method: 'POST', body: { channel: 'chat', body: 'hi' } })).status, 400);
});

test('chat is switched off (not silently unverified) when code verification is not configured', async (t) => {
  const s = setup({ ai: null, verifyPhoneToken: null, env: { CHAT_VERIFICATION: 'codes' } });
  t.after(s.close);
  const cfg = (await s.req('/api/chat/config')).data;
  assert.equal(cfg.enabled, false);
  assert.match(cfg.reason, /Firebase/);
  assert.equal((await s.req('/api/chat/email-code', { method: 'POST', body: { email: person.email } })).status, 503);

  const noEmail = setup({ emailEnabled: false, verifyPhoneToken, env: { CHAT_VERIFICATION: 'codes' } });
  t.after(noEmail.close);
  assert.equal((await noEmail.req('/api/chat/config')).data.enabled, false);
});

test('chat widget script is served with CORS', async (t) => {
  const s = chatSetup();
  t.after(s.close);
  const r = await s.req('/chat.js', { headers: { Origin: 'https://pghshinepro.com' } });
  assert.equal(r.status, 200);
  assert.match(r.data, /Request a call back/);
});

// ---------- simple chat (default): contact details, then instant + streamed answers ----------

function simpleSetup(opts = {}) {
  const s = setup(opts);
  const start = (body = person) => s.req('/api/chat/start', { method: 'POST', body });
  // POST a message with ?stream=1 and collect the Server-Sent Events, with arrival times.
  const stream = async (token, body) => {
    const t0 = Date.now();
    const res = await fetch(`http://127.0.0.1:${s.server.address().port}/api/chat/message?stream=1`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const events = [];
    const dec = new TextDecoder();
    let buf = '';
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const p of parts) {
        const ev = /^event: (.*)$/m.exec(p)[1];
        events.push({ ev, data: JSON.parse(/^data: (.*)$/m.exec(p)[1]), ms: Date.now() - t0 });
      }
    }
    return events;
  };
  return { ...s, start, stream };
}

test('simple chat: name, email and phone start the chat right away (no codes)', async (t) => {
  const s = simpleSetup({ emailEnabled: false });
  t.after(s.close);
  const cfg = (await s.req('/api/chat/config')).data;
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.verification, 'none');
  assert.ok(cfg.questions.length >= 4);
  assert.ok(cfg.questions.every((q) => q.id && q.label && q.answer && !/\$\d/.test(q.answer)));

  assert.equal((await s.start({ ...person, name: '' })).status, 400);
  assert.equal((await s.start({ ...person, email: 'jane@' })).status, 400);
  assert.equal((await s.start({ ...person, phone: '555-01' })).status, 400);
  assert.equal((await s.req('/api/chat/email-code', { method: 'POST', body: { email: person.email } })).status, 400);

  const ok = await s.start();
  assert.equal(ok.status, 201);
  assert.equal(ok.data.messages[0].body, 'Thanks, Jane! 👋 How can we help you today?');
  await s.login();
  const lead = (await s.req('/api/admin/leads')).data[0];
  assert.equal(lead.source, 'chat');
  assert.equal(lead.phone, '+14125550199');
});

test('simple chat: owner is emailed name, phone and email when a chat starts', async (t) => {
  const s = simpleSetup();
  t.after(s.close);
  await s.start();
  await s.until(() => s.sent.some((m) => /New website chat/.test(m.subject || '')));
  const alert = s.sent.find((m) => /New website chat/.test(m.subject || ''));
  assert.equal(alert.subject, '💬 New website chat: Jane Doe, (412) 555-0199, jane@example.com');
});

test('preloaded questions are answered instantly without calling the AI', async (t) => {
  const aiCalls = [];
  const s = simpleSetup({ ai: async (m) => { aiCalls.push(m); return 'AI answer'; } });
  t.after(s.close);
  const { data } = await s.start();
  const q = (await s.req('/api/chat/config')).data.questions.find((x) => x.id === 'price');
  const events = await s.stream(data.token, { question_id: 'price' });
  assert.deepEqual(events.map((e) => e.ev), ['mine', 'delta', 'done']);
  assert.equal(events[0].data.body, q.label);
  assert.equal(events[2].data.body, q.answer);
  assert.match(q.answer, /bedrooms and bathrooms/);
  assert.equal(aiCalls.length, 0);
});

test('typed questions stream the AI answer: first words arrive before the answer is finished', async (t) => {
  const calls = [];
  const ai = async (messages, { onText } = {}) => {
    calls.push(messages);
    const words = ["We'd ", 'love ', 'to ', 'help! ', 'How ', 'many ', 'bedrooms ', 'and ', 'bathrooms?'];
    for (const w of words) { onText && onText(w); await new Promise((r) => setTimeout(r, 40)); }
    return words.join('');
  };
  const s = simpleSetup({ ai });
  t.after(s.close);
  const { data } = await s.start();
  const events = await s.stream(data.token, { message: 'I want my house cleaned' });
  const deltas = events.filter((e) => e.ev === 'delta');
  const done = events.find((e) => e.ev === 'done');
  assert.ok(deltas.length > 3, 'answer arrives in pieces');
  assert.ok(deltas[0].ms < done.ms - 200, `first words at ${deltas[0].ms}ms, finished at ${done.ms}ms`);
  assert.equal(deltas.map((d) => d.data.text).join(''), done.data.body);
  assert.equal(done.data.status, 'ai');
  assert.deepEqual(calls[0], [{ role: 'user', content: 'I want my house cleaned' }]);
  // The conversation is saved for the admin
  await s.login();
  const lead = (await s.req('/api/admin/leads')).data[0];
  const saved = (await s.req(`/api/admin/leads/${lead.id}`)).data.messages.map((m) => m.body);
  assert.ok(saved.includes('I want my house cleaned') && saved.includes(done.data.body));
});

test('without AI (or if it fails), typed questions still get a real answer with one follow-up question', async (t) => {
  for (const ai of [null, async () => null]) {
    const s = simpleSetup({ ai });
    t.after(s.close);
    const { data } = await s.start();
    const ask = async (message) => {
      await new Promise((r) => setTimeout(r, 1050));
      return (await s.req('/api/chat/message', { method: 'POST', body: { message }, headers: { Authorization: `Bearer ${data.token}` } })).data.messages[1].body;
    };
    assert.match(await ask('I want my house cleaned'), /bedrooms and bathrooms/);
    assert.match(await ask('Can I get a quote?'), /ZIP code/);
    assert.match(await ask('3 bedrooms 2 baths'), /ZIP code/);
    assert.match(await ask('15217'), /standard, deep, or move-in/);
    assert.match(await ask('I need someone ASAP, it is urgent'), /call or text us at \(412\) 447-8047/);
    for (const a of [await ask('How much is it?'), await ask('Do you do deep cleaning?')]) {
      assert.doesNotMatch(a, /\$\d/);
      assert.equal((a.match(/\?/g) || []).length, 1, `one question only: ${a}`);
    }
  }
});

test('streamed reply falls back to an instant answer when the AI fails', async (t) => {
  const s = simpleSetup({ ai: async () => null });
  t.after(s.close);
  const { data } = await s.start();
  const events = await s.stream(data.token, { message: 'Do you bring your own supplies?' });
  assert.deepEqual(events.map((e) => e.ev), ['mine', 'delta', 'done']);
  assert.match(events[2].data.body, /bring all our own supplies/);
  await s.until(() => s.sent.some((m) => /needs a reply/.test(m.subject || '')));
});

const { createApp } = require('../src/app');
const { openDb } = require('../src/db');
const { loadConfig } = require('../src/config');

function setup({ emailEnabled = true, smsEnabled = true, failEmail = false, env = {}, ai = null, verifyPhoneToken = null } = {}) {
  const config = loadConfig({
    PRICE_SOURCE: 'package',
    ...env,
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
  const app = createApp({ config, db: openDb(':memory:'), senders, ai, verifyPhoneToken });
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

module.exports = { setup };

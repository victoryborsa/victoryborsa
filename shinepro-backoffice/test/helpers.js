const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');
const { openDb } = require('../src/db');
const { loadConfig } = require('../src/config');

function setup({ emailEnabled = true, smsEnabled = true, failEmail = false, env = {}, ai = null, verifyPhoneToken = null } = {}) {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shinepro-test-uploads-'));
  const config = loadConfig({
    PRICE_SOURCE: 'package',
    UPLOADS_DIR: uploadsDir,
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
  // Each session() is a separate browser with its own cookie (admin, client A, client B...).
  const session = () => {
    let cookie = '';
    return async (path, { method = 'GET', body, headers = {} } = {}) => {
      const res = await fetch(base + path, {
        method,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
        redirect: 'manual',
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      if ((res.headers.get('content-type') || '').startsWith('image/')) {
        return { status: res.status, data: Buffer.from(await res.arrayBuffer()), headers: res.headers };
      }
      const text = await res.text();
      let data = text;
      try { data = JSON.parse(text); } catch { /* not json */ }
      return { status: res.status, data, headers: res.headers };
    };
  };
  const req = session();
  const login = () => req('/api/admin/login', { method: 'POST', body: { password: 'test-password-123' } });
  const until = async (fn) => { for (let i = 0; i < 50; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 10)); } };
  const close = () => { server.close(); fs.rmSync(uploadsDir, { recursive: true, force: true }); };
  return { app, server, req, session, login, sent, config, until, close };
}

module.exports = { setup };

const crypto = require('node:crypto');

const COOKIE = 'sp_admin';
const SESSION_HOURS = 24 * 7;

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function createAuth(config) {
  const attempts = new Map(); // ip -> { count, resetAt }

  function issue(res) {
    const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
    const payload = `${expires}.${crypto.randomBytes(8).toString('hex')}`;
    const token = `${payload}.${sign(payload, config.sessionSecret)}`;
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${config.isProd ? '; Secure' : ''}`);
  }

  function isValid(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return false;
    const i = token.lastIndexOf('.');
    const payload = token.slice(0, i);
    if (!safeEqual(token.slice(i + 1), sign(payload, config.sessionSecret))) return false;
    return Number(payload.split('.')[0]) > Date.now();
  }

  function login(req, res) {
    const ip = req.ip;
    const now = Date.now();
    const entry = attempts.get(ip);
    if (entry && entry.resetAt > now && entry.count >= 10) {
      return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    }
    const password = req.body && req.body.password;
    if (typeof password === 'string' && safeEqual(password, config.adminPassword)) {
      attempts.delete(ip);
      issue(res);
      return res.json({ ok: true });
    }
    const next = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + 15 * 60 * 1000 };
    next.count += 1;
    attempts.set(ip, next);
    return res.status(401).json({ error: 'Wrong password' });
  }

  function logout(req, res) {
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`);
    res.json({ ok: true });
  }

  function requireAdmin(req, res, next) {
    if (!isValid(req)) return res.status(401).json({ error: 'Not logged in' });
    // Mutations must be JSON: blocks cross-site HTML form posts (CSRF).
    if (!['GET', 'HEAD', 'DELETE'].includes(req.method) && !req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
    next();
  }

  return { login, logout, requireAdmin, isValid };
}

module.exports = { createAuth, safeEqual };

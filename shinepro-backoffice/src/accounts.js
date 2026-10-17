// Client & host portal accounts: passwords, one-time "set password" links, sessions.
// No SMS or verification codes: a client proves who they are by clicking a link sent to the
// email address already on their customer record.
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { safeEqual } = require('./auth');
const { normalizeEmail, bool, HttpError } = require('./util');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'sp_portal';
const SESSION_HOURS = 24 * 14;
const SET_LINK_HOURS = 72;   // invite links from the admin / self sign-up
const RESET_LINK_HOURS = 2;  // "forgot password" links
const MIN_PASSWORD = 8;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) {
    await scrypt(String(password), 'timing-equalizer', 64); // same work whether or not the account exists
    return false;
  }
  const hash = await scrypt(String(password), Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function createAccounts({ db, config, notifier }) {
  const q = (sql) => db.prepare(sql);
  const failures = new Map(); // ip -> { count, resetAt }, same rule as the admin login
  // The portal cookie is signed with a key derived from SESSION_SECRET, so an admin cookie can never
  // pass as a portal cookie (or the other way round).
  const key = crypto.createHmac('sha256', config.sessionSecret).update('portal-session-v1').digest();
  const sign = (value) => crypto.createHmac('sha256', key).update(value).digest('base64url');

  // ---------- accounts ----------
  const getAccount = (id) => q('SELECT * FROM portal_accounts WHERE id = ?').get(id) || null;
  const accountForCustomer = (customerId) => q('SELECT * FROM portal_accounts WHERE customer_id = ?').get(customerId) || null;
  const accountByEmail = (email) => q('SELECT * FROM portal_accounts WHERE email = ?').get(email) || null;

  // What the admin sees on the client page.
  function publicAccount(a) {
    if (!a) return null;
    return {
      id: a.id, email: a.email, enabled: a.enabled, is_host: a.is_host, email_updates: a.email_updates,
      has_password: a.password_hash ? 1 : 0, last_login_at: a.last_login_at, created_at: a.created_at,
    };
  }

  // Creates the account for a customer (or updates its flags). The login email is the customer's email.
  function ensureAccount(customer, { enabled, is_host } = {}) {
    const email = normalizeEmail(customer.email);
    if (!email) throw new HttpError(400, 'Add an email address to this client first. It becomes their portal login.');
    let account = accountForCustomer(customer.id);
    const other = accountByEmail(email);
    if (other && (!account || other.id !== account.id)) {
      throw new HttpError(409, 'Another client already uses this email for the portal');
    }
    if (!account) {
      const r = q('INSERT INTO portal_accounts (customer_id, email, enabled, is_host) VALUES (?, ?, ?, ?)')
        .run(customer.id, email, enabled === undefined ? 1 : enabled ? 1 : 0, is_host ? 1 : 0);
      return getAccount(r.lastInsertRowid);
    }
    q(`UPDATE portal_accounts SET email = ?, enabled = ?, is_host = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(email, enabled === undefined ? account.enabled : enabled ? 1 : 0, is_host === undefined ? account.is_host : is_host ? 1 : 0, account.id);
    return getAccount(account.id);
  }

  // ---------- one-time links ----------
  function issueToken(account, purpose) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    // Only the newest link works.
    q('UPDATE password_tokens SET used_at = ? WHERE account_id = ? AND used_at IS NULL').run(now, account.id);
    q('INSERT INTO password_tokens (account_id, token_hash, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(account.id, sha256(token), purpose, now + (purpose === 'reset' ? RESET_LINK_HOURS : SET_LINK_HOURS) * 3600 * 1000, now);
    return token;
  }

  function findToken(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const row = q('SELECT * FROM password_tokens WHERE token_hash = ?').get(sha256(token));
    if (!row || row.used_at || row.expires_at < Date.now()) return null;
    const account = getAccount(row.account_id);
    return account && account.enabled ? { row, account } : null;
  }

  function portalBase(account) {
    return `${config.publicUrl}/${account.is_host ? 'host' : 'portal'}`;
  }

  async function sendPasswordLink(account, purpose = 'set') {
    const customer = q('SELECT name FROM customers WHERE id = ?').get(account.customer_id) || { name: '' };
    const token = issueToken(account, purpose);
    const link = `${portalBase(account)}/set-password?token=${token}`;
    const first = (customer.name || '').split(' ')[0] || 'there';
    const portalName = account.is_host ? 'host portal' : 'client portal';
    const text = purpose === 'reset'
      ? `Hi ${first},\n\nWe got a request to reset your ${config.businessName} ${portalName} password. `
        + `Choose a new password here (the link works once and expires in ${RESET_LINK_HOURS} hours):\n\n${link}\n\n`
        + `If you didn't ask for this, you can ignore this email. Your password won't change.`
      : `Hi ${first},\n\nYour ${config.businessName} ${portalName} is ready. In it you can see your upcoming cleanings, `
        + `request changes and view invoices${account.is_host ? ', manage your properties and see turnover reports' : ''}.\n\n`
        + `Set your password here (the link works once and expires in ${SET_LINK_HOURS} hours):\n\n${link}\n\n`
        + `Your login is this email address: ${account.email}`;
    return notifier.deliver({
      kind: purpose === 'reset' ? 'portal_reset' : 'portal_invite', channel: 'email', to: account.email,
      payload: {
        subject: purpose === 'reset' ? `Reset your ${config.businessName} password` : `Set up your ${config.businessName} ${portalName}`,
        text: `${text}\n\nQuestions? Call or text ${config.businessPhone}.\n\n— ${config.businessName}`,
      },
    });
  }

  // ---------- sessions ----------
  function issueSession(res, account) {
    const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
    const payload = `${account.id}.${account.session_version}.${expires}`;
    // Lax (not Strict) so a client arriving from a link on pghshinepro.com stays logged in.
    // Mutations still require a JSON body, which a cross-site form can't send.
    res.setHeader('Set-Cookie', `${COOKIE}=${payload}.${sign(payload)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${config.isProd ? '; Secure' : ''}`);
    q(`UPDATE portal_accounts SET last_login_at = datetime('now') WHERE id = ?`).run(account.id);
  }

  function clearSession(res) {
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
  }

  function sessionAccount(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return null;
    const i = token.lastIndexOf('.');
    const payload = token.slice(0, i);
    if (!safeEqual(token.slice(i + 1), sign(payload))) return null;
    const [id, version, expires] = payload.split('.').map(Number);
    if (!(expires > Date.now())) return null;
    const account = getAccount(id);
    // Disabled by the admin, or password changed since: the session no longer works.
    if (!account || !account.enabled || account.session_version !== version) return null;
    return account;
  }

  // ---------- route handlers ----------
  function tooMany(req) {
    const entry = failures.get(req.ip);
    return entry && entry.resetAt > Date.now() && entry.count >= 10;
  }
  function recordFailure(req) {
    const now = Date.now();
    const entry = failures.get(req.ip);
    const next = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + 15 * 60 * 1000 };
    next.count += 1;
    failures.set(req.ip, next);
    if (failures.size > 10000) for (const [k, v] of failures) if (v.resetAt < now) failures.delete(k);
  }

  async function login(req, res) {
    if (tooMany(req)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    const email = normalizeEmail(req.body && req.body.email);
    const password = req.body && req.body.password;
    const account = email ? accountByEmail(email) : null;
    const ok = typeof password === 'string' && password.length <= 200
      && await verifyPassword(password, account && account.enabled ? account.password_hash : null);
    if (!ok) {
      recordFailure(req);
      return res.status(401).json({ error: 'Wrong email or password' });
    }
    failures.delete(req.ip);
    issueSession(res, account);
    res.json({ ok: true, is_host: account.is_host });
  }

  function logout(req, res) {
    clearSession(res);
    res.json({ ok: true });
  }

  // "Forgot password" and self sign-up always answer the same way, so nobody can use them to find
  // out who is a customer.
  const GENERIC = 'If that email belongs to a PGH Shine Pro client, we just sent it a link. Check your inbox (and spam folder).';

  async function forgot(req, res) {
    const email = normalizeEmail(req.body && req.body.email);
    if (!email) throw new HttpError(400, 'Please enter a valid email address');
    const account = accountByEmail(email);
    if (account && account.enabled) await sendPasswordLink(account, account.password_hash ? 'reset' : 'set');
    res.json({ ok: true, message: GENERIC });
  }

  async function register(req, res) {
    const email = normalizeEmail(req.body && req.body.email);
    if (!email) throw new HttpError(400, 'Please enter a valid email address');
    let account = accountByEmail(email);
    if (!account) {
      // Only an email that is already on a customer record can sign up. The link goes to that
      // email, so only its owner can finish creating the account.
      const customer = q('SELECT * FROM customers WHERE lower(email) = ? ORDER BY id LIMIT 1').get(email);
      if (customer && !accountForCustomer(customer.id)) account = ensureAccount(customer, { enabled: true });
    }
    // An account the admin turned off stays off.
    if (account && account.enabled) await sendPasswordLink(account, account.password_hash ? 'reset' : 'set');
    res.json({ ok: true, message: GENERIC });
  }

  function checkToken(req, res) {
    const found = findToken(req.query.token);
    if (!found) return res.status(400).json({ error: 'This link has expired or was already used. Ask for a new one below.' });
    res.json({ ok: true, purpose: found.row.purpose, email: found.account.email, is_host: found.account.is_host });
  }

  async function setPassword(req, res) {
    const found = findToken(req.body && req.body.token);
    if (!found) throw new HttpError(400, 'This link has expired or was already used. Ask for a new one.');
    const password = validNewPassword(req.body.password);
    q(`UPDATE portal_accounts SET password_hash = ?, session_version = session_version + 1, updated_at = datetime('now') WHERE id = ?`)
      .run(await hashPassword(password), found.account.id);
    q('UPDATE password_tokens SET used_at = ? WHERE account_id = ? AND used_at IS NULL').run(Date.now(), found.account.id);
    const account = getAccount(found.account.id);
    issueSession(res, account);
    res.json({ ok: true, is_host: account.is_host });
  }

  async function changePassword(account, { current_password, new_password }) {
    if (!(await verifyPassword(String(current_password || ''), account.password_hash))) throw new HttpError(400, 'Your current password is not right');
    const password = validNewPassword(new_password);
    q(`UPDATE portal_accounts SET password_hash = ?, session_version = session_version + 1, updated_at = datetime('now') WHERE id = ?`)
      .run(await hashPassword(password), account.id);
    return getAccount(account.id);
  }

  function validNewPassword(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters for your password`);
    if (password.length > 200) throw new HttpError(400, 'That password is too long');
    return password;
  }

  // Express middleware: the logged-in portal account, or 401. Host routes also need is_host.
  function requirePortal({ host = false } = {}) {
    return (req, res, next) => {
      const account = sessionAccount(req);
      if (!account) return res.status(401).json({ error: 'Please log in' });
      if (host && !account.is_host) return res.status(403).json({ error: 'This account is not set up as a host. Call us to add your rental properties.' });
      if (!['GET', 'HEAD', 'DELETE'].includes(req.method) && !req.is('application/json')) {
        return res.status(415).json({ error: 'Content-Type must be application/json' });
      }
      req.account = account;
      next();
    };
  }

  function setPrefs(account, body) {
    q(`UPDATE portal_accounts SET email_updates = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(bool(body.email_updates) ? 1 : 0, account.id);
  }

  return {
    COOKIE, MIN_PASSWORD, hashPassword, verifyPassword,
    getAccount, accountForCustomer, accountByEmail, publicAccount, ensureAccount, sendPasswordLink,
    issueSession, sessionAccount, requirePortal, changePassword, setPrefs,
    login, logout, forgot, register, checkToken, setPassword,
  };
}

module.exports = { createAccounts, hashPassword, verifyPassword };

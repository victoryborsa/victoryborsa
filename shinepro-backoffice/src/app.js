const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { openDb } = require('./db');
const { createAuth, safeEqual } = require('./auth');
const { createSenders, createNotifier } = require('./notifier');
const { createService } = require('./service');
const { createChatRouter } = require('./chat');
const { createAi } = require('./ai');
const { createPhoneVerifier } = require('./firebase');
const { PRICING } = require('../public/pricing');
const { HttpError, formatPhone } = require('./util');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Simple fixed-window rate limiter (per IP).
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const entry = hits.get(req.ip);
    if (!entry || entry.resetAt < now) hits.set(req.ip, { count: 1, resetAt: now + windowMs });
    else if (++entry.count > max) return res.status(429).json({ error: 'Too many requests. Please call or text us instead.' });
    if (hits.size > 10000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
    next();
  };
}

function twilioSignatureValid(req, config) {
  const signature = req.get('X-Twilio-Signature');
  if (!signature || !config.twilio.authToken) return false;
  const url = config.publicUrl + req.originalUrl;
  const params = req.body || {};
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  const expected = crypto.createHmac('sha1', config.twilio.authToken).update(data).digest('base64');
  return safeEqual(expected, signature);
}

function createApp({
  config,
  db = openDb(config.dbFile),
  senders = createSenders(config),
  ai = createAi(config),
  verifyPhoneToken = config.firebase.projectId && config.firebase.apiKey ? createPhoneVerifier({ projectId: config.firebase.projectId }) : null,
}) {
  const app = express();
  const notifier = createNotifier({ db, config, senders });
  const svc = createService({ db, notifier, config });
  const auth = createAuth(config);

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // SEO: this service (admin.pghshinepro.com) must never show up in Google or compete with
    // the main website. Only pghshinepro.com should be indexed.
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  // wrap async handlers so errors reach the error middleware
  const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // ---------------- public ----------------
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

  const cors = (req, res, next) => {
    const origin = req.get('Origin');
    if (origin && (config.allowedOrigins.includes(origin) || config.allowedOrigins.includes('*'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };

  app.get('/api/pricing', cors, (req, res) => res.json(PRICING));
  app.options('/api/leads', cors);
  app.post('/api/leads', cors, rateLimit({ windowMs: 60 * 60 * 1000, max: 20 }), h(async (req, res) => {
    const body = req.body || {};
    const wantsHtml = !req.is('application/json') && (req.get('Accept') || '').includes('text/html');
    // Honeypot: real people never fill the hidden "company_website" field.
    if (body.company_website) return wantsHtml ? res.redirect(303, '/thanks.html') : res.json({ ok: true });

    let lead;
    try {
      lead = svc.createLead(body, body.source === 'embed' ? 'website-embed' : 'website');
    } catch (err) {
      if (wantsHtml && err.status === 400) return res.status(400).send(`<p>${err.message}. <a href="javascript:history.back()">Go back</a></p>`);
      throw err;
    }
    // Lead is safely saved. Alerts go out in the background so the visitor isn't kept waiting.
    notifier.newLead(lead).catch((err) => console.error('[lead] alert error', err));
    if (wantsHtml) return res.redirect(303, `/thanks.html?price=${lead.estimated_price ?? ''}`);
    res.status(201).json({ ok: true, id: lead.id, estimated_price: lead.estimated_price });
  }));

  // Twilio "A message comes in" webhook: customers texting back land in the admin.
  app.post('/api/twilio/sms', h(async (req, res) => {
    if (!twilioSignatureValid(req, config)) return res.status(403).send('Invalid signature');
    await svc.recordInboundSms({ from: req.body.From, body: req.body.Body });
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }));

  // Website chat (verified customers, AI answers, call-back requests)
  app.use('/api/chat', createChatRouter({ db, config, svc, notifier, ai, verifyPhoneToken, cors, rateLimit }));
  app.get('/chat.js', cors, (req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    next();
  });

  // ---------------- admin auth ----------------
  app.post('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }), auth.login);
  app.post('/api/admin/logout', auth.logout);
  app.get('/api/admin/session', (req, res) => res.json({ loggedIn: auth.isValid(req), businessName: config.businessName }));

  const admin = express.Router();
  admin.use(auth.requireAdmin);
  const id = (req) => Number(req.params.id);

  admin.get('/stats', (req, res) => res.json(svc.stats()));
  admin.get('/meta', (req, res) => res.json({
    pricing: PRICING, leadStatuses: svc.LEAD_STATUSES, jobStatuses: svc.JOB_STATUSES,
    smsConfigured: notifier.senders.smsEnabled, googleVoiceNumber: config.googleVoiceNumber,
    chat: { aiEnabled: Boolean(ai), phoneVerification: config.requirePhoneVerification, phoneVerificationReady: Boolean(verifyPhoneToken) },
  }));
  admin.get('/notifications', (req, res) => res.json(
    db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 200').all()
  ));
  admin.post('/test-alert', h(async (req, res) => {
    const results = [];
    for (const to of config.alertEmails) results.push({ to, ...(await notifier.deliver({ kind: 'test', channel: 'email', to, payload: { subject: `Test alert from ${config.businessName}`, text: 'Email alerts are working. You will get a message like this for every new lead.' } })) });
    for (const to of config.alertPhones) results.push({ to, ...(await notifier.deliver({ kind: 'test', channel: 'sms', to, payload: { body: `${config.businessName}: text alerts are working.` } })) });
    if (!results.length) throw new HttpError(400, 'No ALERT_EMAILS or ALERT_PHONES configured');
    res.json(results);
  }));

  // leads
  admin.get('/leads', (req, res) => res.json(svc.listLeads(req.query)));
  admin.post('/leads', h(async (req, res) => {
    const lead = svc.createLead(req.body, 'admin');
    res.status(201).json(lead);
  }));
  admin.get('/leads/:id', (req, res) => {
    const lead = svc.getLead(id(req));
    res.json({
      ...lead,
      has_chat: Boolean(db.prepare('SELECT 1 FROM chat_sessions WHERE lead_id = ?').get(lead.id)),
      messages: svc.listMessages({ leadId: lead.id }),
      customer: lead.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(lead.customer_id) : null,
      jobs: svc.listJobs().filter((j) => j.lead_id === lead.id),
    });
  });
  admin.patch('/leads/:id', (req, res) => res.json(svc.updateLead(id(req), req.body)));
  admin.delete('/leads/:id', (req, res) => {
    svc.getLead(id(req));
    db.prepare('DELETE FROM leads WHERE id = ?').run(id(req));
    res.json({ ok: true });
  });
  admin.post('/leads/:id/messages', h(async (req, res) => {
    res.status(201).json(await svc.sendMessage({ leadId: id(req), ...pickMessage(req.body) }));
  }));

  // customers
  admin.get('/customers', (req, res) => res.json(svc.listCustomers(req.query)));
  admin.get('/customers/export.csv', (req, res) => {
    const rows = svc.listCustomers({ opted_in: req.query.opted_in === '1' });
    const cols = ['name', 'email', 'phone', 'address', 'city', 'zip', 'marketing_opt_in', 'source', 'created_at'];
    const cell = (v) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(c === 'phone' ? formatPhone(r[c]) : r[c])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  });
  admin.post('/customers', (req, res) => res.status(201).json(svc.createCustomer(req.body)));
  admin.get('/customers/:id', (req, res) => {
    const c = svc.getCustomer(id(req));
    res.json({
      ...c,
      leads: db.prepare('SELECT * FROM leads WHERE customer_id = ? ORDER BY created_at DESC').all(c.id),
      jobs: svc.listJobs({ customer_id: c.id }),
      messages: svc.listMessages({ customerId: c.id }),
    });
  });
  admin.put('/customers/:id', (req, res) => res.json(svc.updateCustomer(id(req), req.body)));
  admin.delete('/customers/:id', (req, res) => {
    svc.getCustomer(id(req));
    db.prepare('DELETE FROM customers WHERE id = ?').run(id(req));
    res.json({ ok: true });
  });
  admin.post('/customers/:id/messages', h(async (req, res) => {
    res.status(201).json(await svc.sendMessage({ customerId: id(req), ...pickMessage(req.body) }));
  }));

  // employees
  admin.get('/employees', (req, res) => res.json(svc.listEmployees()));
  admin.post('/employees', (req, res) => res.status(201).json(svc.createEmployee(req.body)));
  admin.get('/employees/:id', (req, res) => res.json({ ...svc.getEmployee(id(req)), jobs: svc.listJobs({ employee_id: id(req) }) }));
  admin.put('/employees/:id', (req, res) => res.json(svc.updateEmployee(id(req), req.body)));
  admin.delete('/employees/:id', (req, res) => {
    svc.getEmployee(id(req));
    db.prepare('DELETE FROM employees WHERE id = ?').run(id(req));
    res.json({ ok: true });
  });

  // jobs / bookings
  admin.get('/jobs', (req, res) => res.json(svc.listJobs(req.query)));
  admin.post('/jobs', h(async (req, res) => res.status(201).json(await svc.createJob(req.body))));
  admin.get('/jobs/:id', (req, res) => res.json(svc.getJob(id(req))));
  admin.put('/jobs/:id', h(async (req, res) => res.json(await svc.updateJob(id(req), req.body))));
  admin.delete('/jobs/:id', (req, res) => {
    svc.getJob(id(req));
    db.prepare('DELETE FROM jobs WHERE id = ?').run(id(req));
    res.json({ ok: true });
  });

  app.use('/api/admin', admin);

  // ---------------- pages ----------------
  app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
  app.get('/', (req, res) => res.redirect('/quote'));
  app.get('/quote', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'quote.html')));
  app.get('/embed.js', cors, (req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    next();
  });
  app.use(express.static(PUBLIC_DIR, { index: false }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500 && status !== 502) console.error(err);
    res.status(status).json({ error: status >= 500 && status !== 502 ? 'Something went wrong' : err.message, message_record: err.message_record });
  });

  Object.assign(app.locals, { db, svc, notifier });
  return app;
}

function pickMessage(body = {}) {
  return { channel: body.channel, subject: body.subject, body: body.body };
}

module.exports = { createApp };

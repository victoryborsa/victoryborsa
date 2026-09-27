const crypto = require('node:crypto');
const express = require('express');
const { normalizeEmail, normalizePhone, formatPhone, str, bool, HttpError } = require('./util');

const CODE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CUSTOMER_MESSAGES = 40;
const MAX_HISTORY = 40;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Website chat: verified name/email/phone first, then AI answers questions,
// and the customer can leave a note asking for a call back.
function createChatRouter({ db, config, svc, notifier, ai, verifyPhoneToken, cors, rateLimit }) {
  const router = express.Router();
  const q = (sql) => db.prepare(sql);
  const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const phoneCheckReady = Boolean(verifyPhoneToken);
  const lastMessageAt = new Map();

  function availability() {
    if (!notifier.senders.emailEnabled) return { enabled: false, reason: 'Email sending (SMTP) is not configured, so email codes cannot be sent.' };
    if (config.requirePhoneVerification && !phoneCheckReady) return { enabled: false, reason: 'Phone verification (Firebase) is not configured.' };
    return { enabled: true };
  }

  function alertOwner(kind, leadId, subject, text) {
    const link = `${config.publicUrl}/admin#/leads/${leadId}`;
    return Promise.all(config.alertEmails.map((to) => notifier.deliver({
      kind, channel: 'email', to, leadId, payload: { subject, text: `${text}\n\nOpen in admin: ${link}` },
    })));
  }

  const addMessage = (s, direction, body, status) => {
    const r = q(`INSERT INTO messages (lead_id, customer_id, direction, channel, body, status) VALUES (?, ?, ?, 'chat', ?, ?)`)
      .run(s.lead_id, s.customer_id, direction, body, status);
    return q('SELECT id, direction, body, status, created_at FROM messages WHERE id = ?').get(r.lastInsertRowid);
  };

  router.use(cors);

  router.get('/config', (req, res) => {
    const a = availability();
    res.json({
      ...a,
      phoneVerification: config.requirePhoneVerification,
      firebase: config.requirePhoneVerification && phoneCheckReady ? config.firebase : null,
      businessPhone: config.businessPhone,
      businessName: config.businessName,
    });
  });

  // Step 1: email a 6-digit code
  router.post('/email-code', rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }), h(async (req, res) => {
    if (!availability().enabled) throw new HttpError(503, 'Chat is unavailable right now');
    const email = normalizeEmail(req.body && req.body.email);
    if (!email) throw new HttpError(400, 'Please enter a valid email address');
    const recent = q('SELECT COUNT(*) AS n FROM email_codes WHERE email = ? AND created_at > ?').get(email, Date.now() - 60 * 60 * 1000).n;
    if (recent >= 5) throw new HttpError(429, 'Too many codes requested. Please wait a bit and try again.');
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    q('INSERT INTO email_codes (email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(email, sha256(`${email}:${code}:${config.sessionSecret}`), Date.now() + CODE_TTL_MS, Date.now());
    const result = await notifier.deliver({
      kind: 'chat_email_code', channel: 'email', to: email,
      payload: {
        subject: `${code} is your ${config.businessName} verification code`,
        text: `Your verification code is ${code}\n\nEnter it in the chat on our website. It expires in 10 minutes.\nIf you didn't request this, you can ignore this email.\n\n— ${config.businessName}`,
      },
    });
    if (!result.ok) throw new HttpError(502, 'We could not send the email code. Please check the address or call us.');
    res.json({ ok: true });
  }));

  // Step 2: check both codes, create the verified chat session
  router.post('/start', rateLimit({ windowMs: 60 * 60 * 1000, max: 20 }), h(async (req, res) => {
    if (!availability().enabled) throw new HttpError(503, 'Chat is unavailable right now');
    const body = req.body || {};
    const name = str(body.name, 120);
    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    if (!name) throw new HttpError(400, 'Please enter your name');
    if (!email) throw new HttpError(400, 'Please enter a valid email address');
    if (!phone) throw new HttpError(400, 'Please enter a valid phone number');

    const row = q('SELECT * FROM email_codes WHERE email = ? AND used = 0 ORDER BY id DESC LIMIT 1').get(email);
    if (!row || row.expires_at < Date.now()) throw new HttpError(400, 'Your email code expired. Please request a new one.');
    if (row.attempts >= 5) throw new HttpError(400, 'Too many wrong codes. Please request a new one.');
    const given = sha256(`${email}:${String(body.email_code || '').trim()}:${config.sessionSecret}`);
    if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(row.code_hash))) {
      q('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
      throw new HttpError(400, "That email code isn't right. Please check your inbox and try again.");
    }

    let phoneVerified = 0;
    if (config.requirePhoneVerification) {
      let verified;
      try { verified = await verifyPhoneToken(body.phone_token); } catch (err) {
        throw new HttpError(400, 'We could not verify your phone number. Please try the text code again.');
      }
      if (verified !== phone) throw new HttpError(400, 'The verified phone number does not match the one you entered.');
      phoneVerified = 1;
    }
    q('UPDATE email_codes SET used = 1 WHERE id = ?').run(row.id);

    const lead = svc.createLead({ name, email, phone, marketing_opt_in: bool(body.marketing_opt_in), message: 'Started a website chat (email + phone verified).' }, 'chat');
    const token = crypto.randomBytes(32).toString('hex');
    const r = q(`INSERT INTO chat_sessions (token_hash, lead_id, customer_id, name, email, phone, phone_verified, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sha256(token), lead.id, lead.customer_id, name, email, phone, phoneVerified, Date.now() + SESSION_TTL_MS);
    const session = q('SELECT * FROM chat_sessions WHERE id = ?').get(r.lastInsertRowid);
    const greeting = addMessage(session, 'out',
      `Hi ${name.split(' ')[0]}! 👋 Thanks for verifying. I'm the ${config.businessName} assistant. Ask me anything about our cleaning services or prices. If you'd rather talk to a person, tap "Request a call back" and we'll call you as soon as possible.`, 'ai');
    alertOwner('chat_started', lead.id, `💬 New verified chat: ${name}`,
      `${name} started a chat on the website.\nPhone (verified): ${formatPhone(phone)}\nEmail (verified): ${email}`).catch(() => {});
    res.status(201).json({ token, name, messages: [greeting] });
  }));

  // Everything below needs the chat session token
  const requireSession = (req, res, next) => {
    const token = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const s = token && q('SELECT * FROM chat_sessions WHERE token_hash = ?').get(sha256(token));
    if (!s || s.expires_at < Date.now()) return res.status(401).json({ error: 'Your chat session ended. Please start a new chat.' });
    req.chat = s;
    next();
  };

  router.get('/messages', requireSession, (req, res) => {
    const after = Number(req.query.after) || 0;
    res.json(q(`SELECT id, direction, body, status, created_at FROM messages
                WHERE lead_id = ? AND channel = 'chat' AND id > ? ORDER BY id`).all(req.chat.lead_id, after));
  });

  router.post('/message', requireSession, h(async (req, res) => {
    const s = req.chat;
    const text = str(req.body && req.body.message, 1000);
    if (!text) throw new HttpError(400, 'Please type a message');
    if (s.customer_messages >= MAX_CUSTOMER_MESSAGES) {
      throw new HttpError(429, `This chat has reached its limit. Please tap "Request a call back" or call/text ${config.businessPhone}.`);
    }
    const last = lastMessageAt.get(s.id) || 0;
    if (Date.now() - last < 1500) throw new HttpError(429, 'Please wait a moment before sending another message.');
    lastMessageAt.set(s.id, Date.now());

    const mine = addMessage(s, 'in', text, 'received');
    q('UPDATE chat_sessions SET customer_messages = customer_messages + 1 WHERE id = ?').run(s.id);

    // Chat history oldest-first; the API needs it to start with a user turn.
    const rows = q(`SELECT direction, body FROM messages WHERE lead_id = ? AND channel = 'chat' ORDER BY id DESC LIMIT ?`)
      .all(s.lead_id, MAX_HISTORY).reverse();
    while (rows.length && rows[0].direction !== 'in') rows.shift();
    const history = rows.map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.body }));

    let answer = ai ? await ai(history) : null;
    if (!answer) {
      answer = `Thanks for your message! Our team will get back to you shortly. For a faster answer, tap "Request a call back" or call/text ${config.businessPhone}.`;
      alertOwner('chat_question', s.lead_id, `💬 Chat question from ${s.name} needs a reply`,
        `${s.name} (${formatPhone(s.phone)}, ${s.email}) asked:\n\n${text}\n\nThe AI assistant could not answer, so please reply from the admin.`).catch(() => {});
    }
    const reply = addMessage(s, 'out', answer, ai ? 'ai' : 'auto');
    res.json({ messages: [mine, reply] });
  }));

  router.post('/callback', requireSession, h(async (req, res) => {
    const s = req.chat;
    const note = str(req.body && req.body.note, 2000);
    const bestTime = str(req.body && req.body.best_time, 100);
    if (!note) throw new HttpError(400, 'Please add a short note about what you need');
    const mine = addMessage(s, 'in', `📞 Call back requested${bestTime ? ` (best time: ${bestTime})` : ''}:\n${note}`, 'received');
    q(`UPDATE leads SET callback_requested = 1, status = CASE WHEN status IN ('booked') THEN status ELSE 'new' END,
       updated_at = datetime('now') WHERE id = ?`).run(s.lead_id);
    const reply = addMessage(s, 'out',
      `Got it, thank you! We'll call you at ${formatPhone(s.phone)} as soon as possible${bestTime ? ` (you said ${bestTime} works best)` : ''}. If it's urgent, you can also call or text ${config.businessPhone}.`, 'auto');
    await alertOwner('callback_request', s.lead_id, `📞 CALL BACK REQUESTED: ${s.name} ${formatPhone(s.phone)}`,
      `${s.name} asked for a call back from the website chat.\n\nPhone (verified): ${formatPhone(s.phone)}\nEmail (verified): ${s.email}\nBest time: ${bestTime || 'not given'}\n\nNote:\n${note}`);
    res.json({ messages: [mine, reply] });
  }));

  return router;
}

module.exports = { createChatRouter };

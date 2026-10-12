const nodemailer = require('nodemailer');
const { normalizePhone } = require('./util');
const { PRICING } = require('../public/pricing');

// Real senders. Each returns a promise and throws on failure.
function createSenders(config) {
  const smtpReady = Boolean(config.smtp.host && config.smtp.from);
  const transport = smtpReady
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
      })
    : null;

  const twilioReady = Boolean(config.twilio.accountSid && config.twilio.authToken && config.twilio.from);

  return {
    emailEnabled: smtpReady,
    smsEnabled: twilioReady,
    async email({ to, subject, text, html, replyTo }) {
      if (!transport) throw new Error('Email is not configured (set SMTP_HOST and EMAIL_FROM)');
      await transport.sendMail({
        from: `"${config.businessName}" <${config.smtp.from}>`,
        to,
        subject,
        text,
        html,
        replyTo: replyTo || config.smtp.replyTo || undefined,
      });
    },
    async sms({ to, body }) {
      if (!twilioReady) throw new Error('SMS is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)');
      const { accountSid, authToken, from } = config.twilio;
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(`Twilio error ${res.status}: ${data.message || res.statusText}`);
      }
    },
  };
}

const ESTIMATE_NOTE = 'This is an estimate, not a booking. Your appointment is confirmed when we contact you to confirm the date and time.';
const RETRYABLE_STATUSES = ['failed', 'skipped'];
const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 })}`;

// One line of an itemized estimate as text, e.g. "Deep Cleaning — 2 Bedrooms: $309".
function estimateLine(l) {
  if (l.kind === 'travel' || l.kind === 'included') return l.label;
  if (l.kind === 'discount') return `${l.label}: −${usd(Math.abs(l.amount))}`;
  return `${l.label}: ${usd(l.amount)}`;
}

function parseLines(lead) {
  try { return lead.price_lines ? JSON.parse(lead.price_lines) : null; } catch { return null; }
}

// The itemized estimate block used in the owner alert and the customer confirmation.
function estimateText(lead) {
  const lines = parseLines(lead);
  if (!lines) return lead.estimated_price != null ? `Estimated total: ${usd(lead.estimated_price)}` : '';
  const out = lines.map((l) => `  • ${estimateLine(l)}`);
  out.push(lead.estimated_price != null
    ? `  Total: ${usd(lead.estimated_price)}`
    : `  Total: custom quote. We'll send you a personalized price (the ${usd(lead.travel_fee ?? 20)} travel fee is added to every visit).`);
  return `Estimate:\n${out.join('\n')}`;
}

function createNotifier({ db, config, senders }) {
  const q = (sql) => db.prepare(sql);
  const delays = config.notifyRetryDelaysMs && config.notifyRetryDelaysMs.length ? config.notifyRetryDelaysMs : [5000, 30000];
  const MAX_ATTEMPTS = 1 + delays.length > 3 ? 3 : 1 + delays.length;
  const wait = (ms) => new Promise((resolve) => { const t = setTimeout(resolve, ms); if (t.unref) t.unref(); });

  const getRow = (id) => q('SELECT * FROM notifications WHERE id = ?').get(id);
  const setRow = (id, status, error, attempts) => q(`UPDATE notifications SET status = ?, error = ?, attempts = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(status, error, attempts, id);

  // One try. Never throws.
  async function attempt(channel, to, payload) {
    const enabled = channel === 'email' ? senders.emailEnabled : senders.smsEnabled;
    if (!enabled) return { ok: false, status: 'skipped', error: `${channel === 'email' ? 'Email' : 'SMS'} is not configured` };
    try {
      if (channel === 'email') await senders.email({ to, ...payload });
      else await senders.sms({ to, ...payload });
      return { ok: true, status: 'sent' };
    } catch (err) {
      return { ok: false, status: 'failed', error: err.message };
    }
  }

  // Keeps trying a logged notification until it is sent or out of attempts. The row is the only record:
  // a message that was sent is never sent again.
  async function runAttempts(id, { kind, channel, to, payload }, { firstAttempt = 1, retry = true } = {}) {
    let n = firstAttempt;
    for (;;) {
      const result = await attempt(channel, to, payload);
      const more = retry && result.status === 'failed' && n < MAX_ATTEMPTS;
      setRow(id, result.ok ? 'sent' : more ? 'retrying' : result.status, result.error || null, n);
      if (result.ok || !more) {
        if (!result.ok) console.error(`[notify] ${kind} ${channel} to ${to} ${result.status} after ${n} attempt(s):`, result.error);
        return { ...result, id, attempts: n };
      }
      await wait(delays[Math.min(n - 1, delays.length - 1)]);
      n += 1;
    }
  }

  // Sends one notification and records it in the notifications log. Never throws.
  // The first attempt is awaited; if it fails, up to 2 more attempts run in the background
  // (with backoff) and update the same log row. result.done resolves with the final outcome.
  // retry: false for messages the admin sends by hand (they see the error and decide).
  async function deliver({ kind, channel, to, leadId = null, formId = null, payload, retry = true }) {
    const r = q(`INSERT INTO notifications (kind, channel, recipient, status, error, lead_id, form_id, payload, attempts, updated_at)
                 VALUES (?, ?, ?, 'sending', NULL, ?, ?, ?, 0, datetime('now'))`)
      .run(kind, channel, to, leadId, formId, JSON.stringify(payload || {}));
    const id = Number(r.lastInsertRowid);
    const first = await attempt(channel, to, payload);
    const more = retry && first.status === 'failed' && MAX_ATTEMPTS > 1;
    setRow(id, first.ok ? 'sent' : more ? 'retrying' : first.status, first.error || null, 1);
    const result = { ...first, id, attempts: 1 };
    if (!more) {
      if (!first.ok && first.status === 'failed') console.error(`[notify] ${kind} ${channel} to ${to} failed:`, first.error);
      return { ...result, done: Promise.resolve(result) };
    }
    const done = wait(delays[0]).then(() => runAttempts(id, { kind, channel, to, payload }, { firstAttempt: 2 }));
    done.catch(() => {});
    return { ...result, retrying: true, done };
  }

  // Admin "Retry" on a failed or skipped notification. Sends it once more (same recipient and text).
  async function retry(id) {
    const row = getRow(Number(id));
    if (!row) return { ok: false, status: 'missing', error: 'Notification not found' };
    // Claim it first so a double click can't send it twice.
    const claimed = q(`UPDATE notifications SET status = 'sending', updated_at = datetime('now')
                       WHERE id = ? AND status IN (${RETRYABLE_STATUSES.map(() => '?').join(',')})`).run(row.id, ...RETRYABLE_STATUSES);
    if (!claimed.changes) return { ok: false, status: row.status, error: row.status === 'sent' ? 'Already sent' : `Can't retry a notification that is ${row.status}` };
    let payload;
    try { payload = JSON.parse(row.payload || 'null'); } catch { payload = null; }
    if (!payload) {
      setRow(row.id, row.status, 'Nothing saved to resend (sent before retries were added)', row.attempts);
      return { ok: false, status: row.status, error: 'This notification was logged before retries were added and cannot be resent' };
    }
    const result = await runAttempts(row.id, { kind: row.kind, channel: row.channel, to: row.recipient, payload }, { firstAttempt: (row.attempts || 1) + 1, retry: false });
    if (result.ok && row.lead_id && ['new_lead', 'contact_message'].includes(row.kind) && config.alertEmails.includes(row.recipient)) {
      q('UPDATE leads SET admin_notified = 1 WHERE id = ?').run(row.lead_id);
    }
    return { ...result, notification: getRow(row.id) };
  }

  function leadSummary(lead) {
    const bits = [
      `Name: ${lead.name}`,
      lead.phone && `Phone: ${lead.phone}`,
      lead.email && `Email: ${lead.email}`,
      lead.preferred_contact && `Preferred contact: ${lead.preferred_contact}`,
      lead.address && `Address: ${lead.address}${lead.zip ? ` ${lead.zip}` : ''}`,
      !lead.address && lead.zip && `ZIP: ${lead.zip}`,
      lead.service_type && `Service: ${(PRICING.services[lead.service_type] && PRICING.services[lead.service_type].label) || lead.service_type}`,
      (lead.bedrooms != null || lead.bathrooms != null) && `Home: ${lead.bedrooms ?? '?'} bd / ${lead.bathrooms ?? '?'} ba${lead.sqft ? `, ${lead.sqft} sqft` : ''}`,
      lead.frequency && `Frequency: ${(PRICING.frequency[lead.frequency] && PRICING.frequency[lead.frequency].label) || lead.frequency}`,
      lead.preferred_date && `Preferred date: ${lead.preferred_date}${lead.preferred_time ? ` ${lead.preferred_time}` : ''}`,
      !lead.preferred_date && lead.preferred_time && `Preferred time: ${lead.preferred_time}`,
      lead.referred_by && `Referred by: ${lead.referred_by}`,
      lead.gift_code && `Gift card code: ${lead.gift_code}`,
      lead.message && `Message: ${lead.message}`,
    ];
    const est = estimateText(lead);
    return [bits.filter(Boolean).join('\n'), est, est ? ESTIMATE_NOTE : ''].filter(Boolean).join('\n\n');
  }

  const isAdminTask = (t) => t.admin;
  async function sendAll(lead, tasks) {
    const results = await Promise.all(tasks.map((t) => t.run()));
    const markIfReached = (list) => {
      if (list.some((r, i) => isAdminTask(tasks[i]) && r.ok)) q('UPDATE leads SET admin_notified = 1 WHERE id = ?').run(lead.id);
    };
    markIfReached(results);
    // Wait for any automatic retries, then record whether the owner was reached after all.
    const finals = await Promise.all(results.map((r) => r.done || r));
    markIfReached(finals);
    return finals;
  }

  async function newLead(lead) {
    const link = `${config.publicUrl}/admin#/leads/${lead.id}`;
    const summary = leadSummary(lead);
    const priceTag = lead.estimated_price != null ? ` (${usd(lead.estimated_price)})` : '';
    const tasks = [];
    for (const to of config.alertEmails) {
      tasks.push({ admin: true, run: () => deliver({
        kind: 'new_lead', channel: 'email', to, leadId: lead.id,
        payload: {
          subject: `🔔 New quote request: ${lead.name}${priceTag}`,
          text: `You have a new lead!\n\n${summary}\n\nOpen in admin: ${link}`,
          replyTo: lead.email || undefined,
        },
      }) });
    }
    // Owner text alerts need an SMS provider (Twilio). With Google Voice, alerts arrive by email.
    for (const phone of senders.smsEnabled ? config.alertPhones : []) {
      const to = normalizePhone(phone);
      if (!to) continue;
      tasks.push({ admin: true, run: () => deliver({
        kind: 'new_lead', channel: 'sms', to, leadId: lead.id,
        payload: {
          body: `New ${config.businessName} lead: ${lead.name} ${lead.phone || ''} ${lead.email || ''}`.trim()
            + `${lead.service_type ? ` | ${lead.service_type}` : ''}${lead.estimated_price != null ? ` | ${usd(lead.estimated_price)} incl. travel fee` : ''}\n${link}`,
        },
      }) });
    }
    if (config.sendCustomerConfirmation && lead.email) {
      const est = estimateText(lead);
      tasks.push({ admin: false, run: () => deliver({
        kind: 'customer_confirmation', channel: 'email', to: lead.email, leadId: lead.id,
        payload: {
          subject: `We received your estimate request — ${config.businessName}`,
          text: `Hi ${lead.name.split(' ')[0]},\n\nThanks for requesting an estimate from ${config.businessName}!`
            + `${est ? `\n\n${est}\n\n${ESTIMATE_NOTE}` : `\n\n${ESTIMATE_NOTE}`}`
            + `\n\nWe'll contact you shortly${lead.preferred_contact ? ` by ${lead.preferred_contact}` : ''} to confirm the details.`
            + `${config.businessPhone ? `\n\nNeed us sooner? Call or text ${config.businessPhone}.` : ''}`
            + `\n\n— ${config.businessName}`,
        },
      }) });
    }
    return sendAll(lead, tasks);
  }

  // Website contact form (saved as a lead with source "contact").
  async function newContact(lead) {
    const link = `${config.publicUrl}/admin#/leads/${lead.id}`;
    const tasks = config.alertEmails.map((to) => ({ admin: true, run: () => deliver({
      kind: 'contact_message', channel: 'email', to, leadId: lead.id,
      payload: {
        subject: `📩 New website message: ${lead.name}`,
        text: `Someone sent a message from the website contact form.\n\n${leadSummary(lead)}\n\nOpen in admin: ${link}`,
        replyTo: lead.email || undefined,
      },
    }) }));
    if (config.sendCustomerConfirmation && lead.email) {
      tasks.push({ admin: false, run: () => deliver({
        kind: 'contact_confirmation', channel: 'email', to: lead.email, leadId: lead.id,
        payload: {
          subject: `We got your message — ${config.businessName}`,
          text: `Hi ${lead.name.split(' ')[0]},\n\nThanks for contacting ${config.businessName}! We received your message and will get back to you shortly`
            + `${lead.preferred_contact ? ` by ${lead.preferred_contact}` : ''}.`
            + `${lead.message ? `\n\nYour message:\n${lead.message}` : ''}`
            + `${config.businessPhone ? `\n\nNeed us sooner? Call or text ${config.businessPhone}.` : ''}\n\n— ${config.businessName}`,
        },
      }) });
    }
    return sendAll(lead, tasks);
  }

  // Other website forms (careers, gift cards, event quotes...): owner alert only.
  async function newFormSubmission(sub) {
    const link = `${config.publicUrl}/admin#/forms`;
    const fields = Object.entries(sub.fields || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
    const results = await Promise.all(config.alertEmails.map((to) => deliver({
      kind: 'website_form', channel: 'email', to, formId: sub.id,
      payload: {
        subject: `📝 New website form: ${sub.form}${sub.name ? ` from ${sub.name}` : ''}`,
        text: `A "${sub.form}" form was sent from the website.\n\n${[sub.name && `Name: ${sub.name}`, sub.phone && `Phone: ${sub.phone}`, sub.email && `Email: ${sub.email}`,
          sub.preferred_contact && `Preferred contact: ${sub.preferred_contact}`].filter(Boolean).join('\n')}${fields ? `\n\n${fields}` : ''}\n\nOpen in admin: ${link}`,
        replyTo: sub.email || undefined,
      },
    })));
    return Promise.all(results.map((r) => r.done || r));
  }

  async function inboundReply({ fromName, from, body, leadId }) {
    const link = leadId ? `${config.publicUrl}/admin#/leads/${leadId}` : `${config.publicUrl}/admin`;
    await Promise.all(config.alertEmails.map((to) => deliver({
      kind: 'inbound_sms', channel: 'email', to, leadId,
      payload: { subject: `💬 Text reply from ${fromName || from}`, text: `${fromName || from} (${from}) wrote:\n\n${body}\n\nReply from admin: ${link}` },
    })));
  }

  return { deliver, retry, newLead, newContact, newFormSubmission, inboundReply, senders, leadSummary };
}

module.exports = { createSenders, createNotifier, estimateText, ESTIMATE_NOTE };

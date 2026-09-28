const nodemailer = require('nodemailer');
const { normalizePhone } = require('./util');

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

function createNotifier({ db, config, senders }) {
  const logStmt = db.prepare(
    'INSERT INTO notifications (kind, channel, recipient, status, error, lead_id) VALUES (?, ?, ?, ?, ?, ?)'
  );

  // Sends one notification and records the outcome. Never throws.
  async function deliver({ kind, channel, to, leadId = null, payload }) {
    const enabled = channel === 'email' ? senders.emailEnabled : senders.smsEnabled;
    if (!enabled) {
      logStmt.run(kind, channel, to, 'skipped', `${channel} not configured`, leadId);
      return { ok: false, status: 'skipped', error: `${channel === 'email' ? 'Email' : 'SMS'} is not configured` };
    }
    try {
      if (channel === 'email') await senders.email({ to, ...payload });
      else await senders.sms({ to, ...payload });
      logStmt.run(kind, channel, to, 'sent', null, leadId);
      return { ok: true, status: 'sent' };
    } catch (err) {
      console.error(`[notify] ${kind} ${channel} to ${to} failed:`, err.message);
      logStmt.run(kind, channel, to, 'failed', err.message, leadId);
      return { ok: false, status: 'failed', error: err.message };
    }
  }

  function leadSummary(lead) {
    const lines = [
      `Name: ${lead.name}`,
      lead.phone && `Phone: ${lead.phone}`,
      lead.email && `Email: ${lead.email}`,
      lead.address && `Address: ${lead.address}${lead.zip ? ` ${lead.zip}` : ''}`,
      lead.service_type && `Service: ${lead.service_type}`,
      (lead.bedrooms != null || lead.bathrooms != null) && `Home: ${lead.bedrooms ?? '?'} bd / ${lead.bathrooms ?? '?'} ba${lead.sqft ? `, ${lead.sqft} sqft` : ''}`,
      lead.frequency && `Frequency: ${lead.frequency}`,
      lead.preferred_date && `Preferred date: ${lead.preferred_date}`,
      lead.estimated_price != null && `Quoted estimate: $${lead.estimated_price}`,
      lead.message && `Message: ${lead.message}`,
    ];
    return lines.filter(Boolean).join('\n');
  }

  async function newLead(lead) {
    const link = `${config.publicUrl}/admin#/leads/${lead.id}`;
    const summary = leadSummary(lead);
    const tasks = [];
    for (const to of config.alertEmails) {
      tasks.push(deliver({
        kind: 'new_lead', channel: 'email', to, leadId: lead.id,
        payload: {
          subject: `🔔 New quote request: ${lead.name}${lead.estimated_price != null ? ` ($${lead.estimated_price})` : ''}`,
          text: `You have a new lead!\n\n${summary}\n\nOpen in admin: ${link}`,
          replyTo: lead.email || undefined,
        },
      }));
    }
    // Owner text alerts need an SMS provider (Twilio). With Google Voice, alerts arrive by email.
    for (const phone of senders.smsEnabled ? config.alertPhones : []) {
      const to = normalizePhone(phone);
      if (!to) continue;
      tasks.push(deliver({
        kind: 'new_lead', channel: 'sms', to, leadId: lead.id,
        payload: {
          body: `New ${config.businessName} lead: ${lead.name} ${lead.phone || ''} ${lead.email || ''}`.trim()
            + `${lead.service_type ? ` | ${lead.service_type}` : ''}${lead.estimated_price != null ? ` | $${lead.estimated_price}` : ''}\n${link}`,
        },
      }));
    }
    if (config.sendCustomerConfirmation && lead.email) {
      tasks.push(deliver({
        kind: 'customer_confirmation', channel: 'email', to: lead.email, leadId: lead.id,
        payload: {
          subject: `We received your quote request — ${config.businessName}`,
          text: `Hi ${lead.name.split(' ')[0]},\n\nThanks for requesting a quote from ${config.businessName}! `
            + `${lead.estimated_price != null ? `Your estimated price is $${lead.estimated_price}. ` : ''}`
            + `We'll contact you shortly to confirm the details.`
            + `${config.businessPhone ? `\n\nNeed us sooner? Call or text ${config.businessPhone}.` : ''}`
            + `\n\n— ${config.businessName}`,
        },
      }));
    }
    const adminTaskCount = tasks.length - (config.sendCustomerConfirmation && lead.email ? 1 : 0);
    const results = await Promise.all(tasks);
    const adminReached = results.slice(0, adminTaskCount).some((r) => r.ok);
    if (adminReached) db.prepare('UPDATE leads SET admin_notified = 1 WHERE id = ?').run(lead.id);
    return results;
  }

  async function inboundReply({ fromName, from, body, leadId }) {
    const link = leadId ? `${config.publicUrl}/admin#/leads/${leadId}` : `${config.publicUrl}/admin`;
    await Promise.all(config.alertEmails.map((to) => deliver({
      kind: 'inbound_sms', channel: 'email', to, leadId,
      payload: { subject: `💬 Text reply from ${fromName || from}`, text: `${fromName || from} (${from}) wrote:\n\n${body}\n\nReply from admin: ${link}` },
    })));
  }

  return { deliver, newLead, inboundReply, senders };
}

module.exports = { createSenders, createNotifier };

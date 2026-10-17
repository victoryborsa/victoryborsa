// Sends email through Brevo's web API (https on port 443), for hosts that block SMTP and whose own mail service
// doesn't reach Gmail reliably (GoDaddy Node.js Hosting). Needs BREVO_API_KEY, and a sender address on a domain
// verified in Brevo (EMAIL_FROM, default bookings@pghshinepro.com). Free plan: 300 emails a day.
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 30000;

const list = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean));

function brevoPayload({ from, fromName, to, subject, text, html, replyTo, attachments }) {
  const payload = { sender: { email: from, ...(fromName ? { name: fromName } : {}) }, to: list(to).map((email) => ({ email })), subject };
  if (html) payload.htmlContent = html;
  if (text) payload.textContent = text;
  if (replyTo) payload.replyTo = { email: replyTo };
  if (attachments && attachments.length) {
    payload.attachment = attachments.map((a) => ({
      name: a.filename,
      content: (Buffer.isBuffer(a.content) ? a.content : Buffer.from(String(a.content), 'utf-8')).toString('base64'),
    }));
  }
  return payload;
}

async function sendViaBrevo(message, { apiKey, url = BREVO_URL, fetchImpl = fetch } = {}) {
  let res;
  let body;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'api-key': apiKey },
      body: JSON.stringify(brevoPayload(message)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    body = await res.json().catch(() => ({}));
  } catch (err) {
    throw new Error(`Brevo unreachable: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
  }
  if (!res.ok) throw new Error(`Brevo refused the email: ${body.message || `HTTP ${res.status}`}`);
  return { messageId: body.messageId };
}

module.exports = { sendViaBrevo, brevoPayload, BREVO_URL };

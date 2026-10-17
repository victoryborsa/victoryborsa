// Sends email through GoDaddy Node.js Hosting's built-in mail service, which listens only inside the app's
// own container. GoDaddy blocks outgoing SMTP there, so this replaces Gmail SMTP when the app runs on GoDaddy.
// GoDaddy chooses the sender address itself (no password needed); we set Reply-To so replies reach the business.
const GATEWAY_URL = 'http://127.0.0.1:2525/api/email/send';
const TIMEOUT_MS = 30000;

const list = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean));

function payloadFor({ to, subject, text, html, replyTo, attachments }) {
  const payload = { to: list(to), subject };
  if (text) payload.text = text;
  if (html) payload.html = html;
  if (replyTo) payload.replyTo = replyTo;
  if (attachments && attachments.length) {
    payload.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: (Buffer.isBuffer(a.content) ? a.content : Buffer.from(String(a.content), 'utf-8')).toString('base64'),
      ...(a.contentType ? { contentType: a.contentType } : {}),
    }));
  }
  return payload;
}

async function sendViaGateway(message, { url = GATEWAY_URL, fetchImpl = fetch } = {}) {
  let res;
  let body;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payloadFor(message)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    body = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
  } catch (err) {
    throw new Error(`GoDaddy mail service unreachable: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
  }
  if (!res.ok || !body.success) throw new Error(`GoDaddy mail service refused the email: ${body.error || `HTTP ${res.status}`}`);
  return { messageId: body.messageId };
}

module.exports = { sendViaGateway, payloadFor, GATEWAY_URL };

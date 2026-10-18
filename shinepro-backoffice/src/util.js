// Normalizes US phone numbers to E.164 (+14125550123). Returns null if it can't.
function normalizePhone(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function formatPhone(e164) {
  if (!e164) return '';
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

function normalizeEmail(input) {
  if (!input) return null;
  const email = String(input).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function str(value, max = 500) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

function num(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on' || value === 'yes';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// A local wall-clock time "YYYY-MM-DDTHH:MM" (Pittsburgh time, as typed in the admin) as text,
// e.g. "Tue, Oct 20, 9:00 AM". Never shifted by the server's own time zone.
function fmtLocal(local, opts = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(local || '');
  if (!m) return String(local || '');
  const { hour, minute, ...dateOnly } = opts;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0)))
    .toLocaleString('en-US', { ...(m[4] ? opts : dateOnly), timeZone: 'UTC' });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { normalizePhone, formatPhone, normalizeEmail, str, num, bool, escapeHtml, fmtLocal, HttpError };

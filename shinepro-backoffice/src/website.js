// Public endpoints the static website (pghshinepro.com) posts to, other than /api/leads:
//   POST /api/contact     contact form   -> a lead with source "contact", owner alert, customer confirmation
//   POST /api/newsletter  email sign-up  -> client record with marketing_opt_in = 1
//   POST /api/forms       other forms    -> form_submissions (Admin -> Website forms), owner alert
// and the admin side of the "Website forms" list.
//
// Every endpoint: CORS for SITE_ORIGINS, honeypot field "company_website", rate limit,
// request_id for safe retries, JSON errors {error: "plain sentence"} with status 400.
const { normalizeEmail, str, HttpError } = require('./util');

const MAX_FIELDS = 40;
const MAX_FIELD_NAME = 80;
const MAX_FIELD_VALUE = 5000;
const MAX_FIELDS_TOTAL = 20000; // characters of all field values together
const DUPLICATE_WINDOW = '-2 minutes';
// Top-level keys that are not form fields.
const RESERVED = new Set(['form', 'name', 'email', 'phone', 'preferred_contact', 'request_id', 'company_website', 'fields', 'source']);

function validRequestId(v) {
  const id = str(v, 100);
  return id && /^[A-Za-z0-9_.:-]{6,100}$/.test(id) ? id : null;
}

function createWebsite({ db, svc, notifier }) {
  const q = (sql) => db.prepare(sql);

  // ---------- website forms ----------
  // Turns {label: value} pairs into a clean object of short text values.
  function cleanFields(raw) {
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) throw new HttpError(400, 'Form fields must be sent as named fields');
    const out = {};
    let total = 0;
    for (const [k, v] of Object.entries(raw || {})) {
      const key = String(k).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, MAX_FIELD_NAME);
      if (!key || v === undefined || v === null || v === '') continue;
      let value = Array.isArray(v) ? v.map((x) => String(x)).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
      value = value.trim();
      if (!value) continue;
      if (value.length > MAX_FIELD_VALUE) throw new HttpError(400, `"${key}" is too long (${MAX_FIELD_VALUE} characters at most)`);
      if (Object.keys(out).length >= MAX_FIELDS) throw new HttpError(400, `Too many fields (${MAX_FIELDS} at most)`);
      total += value.length;
      if (total > MAX_FIELDS_TOTAL) throw new HttpError(400, 'This form is too long. Please shorten your answers or call us.');
      out[key] = value;
    }
    return out;
  }

  const hydrate = (row) => {
    if (!row) return row;
    let fields = {};
    try { fields = JSON.parse(row.fields || '{}'); } catch { /* keep empty */ }
    return { ...row, fields };
  };
  function getSubmission(id) {
    const row = q('SELECT * FROM form_submissions WHERE id = ?').get(Number(id));
    if (!row) throw new HttpError(404, 'Form not found');
    return hydrate(row);
  }

  // Returns { submission, duplicate }.
  function submitForm(body) {
    const form = str(body.form, 80);
    if (!form) throw new HttpError(400, 'Missing form name');
    const contact = svc.contactInput(body, { nameRequired: false });
    if (body.fields != null && (typeof body.fields !== 'object' || Array.isArray(body.fields))) throw new HttpError(400, 'Form fields must be sent as named fields');
    // Fields come in "fields" ({label: value}); any other top-level keys are kept too.
    const extra = {};
    for (const [k, v] of Object.entries(body)) if (!RESERVED.has(k)) extra[k] = v;
    const fields = cleanFields({ ...extra, ...(body.fields || {}) });
    const request_id = validRequestId(body.request_id);
    const json = JSON.stringify(fields);
    const dup = (request_id && q('SELECT * FROM form_submissions WHERE request_id = ?').get(request_id))
      || q(`SELECT * FROM form_submissions WHERE form = ? AND fields = ? AND created_at >= datetime('now', '${DUPLICATE_WINDOW}')
            AND ((? IS NOT NULL AND email = ?) OR (? IS NOT NULL AND phone = ?)) ORDER BY id LIMIT 1`)
        .get(form, json, contact.email, contact.email, contact.phone, contact.phone);
    if (dup) return { submission: hydrate(dup), duplicate: true };
    const r = q(`INSERT INTO form_submissions (form, name, email, phone, preferred_contact, fields, request_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(form, contact.name, contact.email, contact.phone, contact.preferred_contact, json, request_id);
    return { submission: getSubmission(r.lastInsertRowid), duplicate: false };
  }

  function listSubmissions({ status } = {}) {
    const where = status === 'unread' ? 'WHERE read_at IS NULL' : status === 'read' ? 'WHERE read_at IS NOT NULL' : '';
    return q(`SELECT * FROM form_submissions ${where} ORDER BY (read_at IS NULL) DESC, created_at DESC, id DESC LIMIT 1000`).all().map(hydrate);
  }

  const unreadCount = () => q('SELECT COUNT(*) AS n FROM form_submissions WHERE read_at IS NULL').get().n;

  // ---------- routes ----------
  function mountPublic(app, { cors, rateLimit, h }) {
    const honeypot = (req, res, next) => ((req.body || {}).company_website ? res.json({ ok: true, duplicate: false }) : next());
    const limit = () => rateLimit({ windowMs: 60 * 60 * 1000, max: 20 });

    app.options(['/api/contact', '/api/newsletter', '/api/forms'], cors);

    app.post('/api/contact', cors, limit(), honeypot, h(async (req, res) => {
      const b = req.body || {};
      if (!str(b.message, 5000)) throw new HttpError(400, 'Please enter a message');
      const { lead, duplicate } = svc.submitLead({ ...b, service_type: b.interest }, 'contact', { dedupe: true, priced: false });
      if (!duplicate) notifier.newContact(lead).catch((err) => console.error('[contact] alert error', err));
      res.status(duplicate ? 200 : 201).json({ ok: true, id: lead.id, lead_id: lead.id, duplicate });
    }));

    app.post('/api/newsletter', cors, limit(), honeypot, h(async (req, res) => {
      const b = req.body || {};
      if (!normalizeEmail(b.email)) throw new HttpError(400, 'Please enter a valid email address');
      const { customer, duplicate } = svc.subscribe(b);
      res.status(duplicate ? 200 : 201).json({ ok: true, id: customer.id, duplicate });
    }));

    app.post('/api/forms', cors, limit(), honeypot, h(async (req, res) => {
      const { submission, duplicate } = submitForm(req.body || {});
      if (!duplicate) notifier.newFormSubmission(submission).catch((err) => console.error('[forms] alert error', err));
      res.status(duplicate ? 200 : 201).json({ ok: true, id: submission.id, duplicate });
    }));
  }

  function mountAdmin(admin) {
    const id = (req) => Number(req.params.id);
    admin.get('/forms', (req, res) => res.json(listSubmissions(req.query)));
    admin.get('/forms/:id', (req, res) => res.json({
      ...getSubmission(id(req)),
      notifications: q('SELECT id, kind, channel, recipient, status, error, attempts, created_at, updated_at FROM notifications WHERE form_id = ? ORDER BY id').all(id(req)),
    }));
    admin.patch('/forms/:id', (req, res) => {
      getSubmission(id(req));
      const read = !(req.body && (req.body.read === false || req.body.read === 'false'));
      q(`UPDATE form_submissions SET read_at = ${read ? "COALESCE(read_at, datetime('now'))" : 'NULL'} WHERE id = ?`).run(id(req));
      res.json(getSubmission(id(req)));
    });
    admin.delete('/forms/:id', (req, res) => {
      getSubmission(id(req));
      q('DELETE FROM form_submissions WHERE id = ?').run(id(req));
      res.json({ ok: true });
    });
  }

  return { mountPublic, mountAdmin, submitForm, listSubmissions, unreadCount };
}

module.exports = { createWebsite };

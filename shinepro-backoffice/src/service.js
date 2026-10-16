const { quote, PRICING } = require('../public/pricing');
const { normalizePhone, normalizeEmail, formatPhone, str, num, bool, fmtLocal, HttpError } = require('./util');

const LEAD_STATUSES = ['new', 'contacted', 'quoted', 'booked', 'lost'];
const JOB_STATUSES = ['scheduled', 'completed', 'cancelled'];
const CONTACT_METHODS = ['phone', 'email', 'text'];
const DUPLICATE_WINDOW = '-2 minutes';
// A website chat that hasn't checked in for this long means the customer left the page.
const CHAT_AWAY_MS = 90 * 1000;
const ADDON_IDS = PRICING.addons.map((a) => a.id);

// ---------- pricing (public/pricing.js is the only price list) ----------
const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Accepts an id ("deep") or its label ("Deep Cleaning"). Returns the id, or null if unknown.
function resolveKey(table, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const v = String(raw).trim();
  if (Object.prototype.hasOwnProperty.call(table, v)) return v;
  const n = squash(v);
  return Object.keys(table).find((k) => squash(k) === n || squash(table[k].label) === n) || null;
}
function parseAddons(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  return [...new Set(list.map((x) => String(x).trim().toLowerCase()).filter((id) => ADDON_IDS.includes(id)))];
}
const clampHours = (h) => Math.max(1, Math.min(8, Math.round(Number(h) || 1)));
const present = (v) => v !== undefined && v !== null && v !== '';

// Turns what the browser sent into stored fields plus the server's own quote.
// Any price the browser sends (estimated_price, estimated_total) is ignored.
function priceRequest(body) {
  const rawService = present(body.service) ? body.service : body.service_type;
  const serviceId = resolveKey(PRICING.services, rawService);
  const rawSize = present(body.size) ? body.size : body.bedrooms;
  const parsedSize = present(rawSize) ? parseInt(String(rawSize), 10) : NaN;
  const size = Number.isFinite(parsedSize) ? Math.max(1, Math.min(5, parsedSize)) : null;
  const frequency = resolveKey(PRICING.frequency, body.frequency);
  const addons = parseAddons(body.addons);
  const rawHours = present(body.organizing_hours) ? body.organizing_hours : body.organizingHours;
  const organizing_hours = addons.includes('organizing') ? clampHours(rawHours) : null;
  const q = serviceId ? quote({ service: serviceId, size: size == null ? undefined : String(size), frequency, addons, organizingHours: organizing_hours }) : null;
  return {
    service_type: serviceId || str(rawService, 60), // an unknown service is kept as text, with no price
    frequency: frequency || str(body.frequency, 40),
    bedrooms: size,
    addons,
    organizing_hours,
    quote: q,
  };
}

// The stored itemized estimate. Quote-only services keep the travel fee line and a null total.
function breakdownOf(q) {
  if (!q) return null;
  return { lines: q.lines, subtotal: q.subtotal, discount: q.discount, travel_fee: q.travelFee, total: q.total, quote_only: Boolean(q.quoteOnly) };
}
function leadBreakdown(lead) {
  if (!lead || !lead.price_lines) return null;
  let lines;
  try { lines = JSON.parse(lead.price_lines); } catch { return null; }
  return {
    lines, subtotal: lead.price_subtotal, discount: lead.price_discount || 0, travel_fee: lead.travel_fee,
    total: lead.estimated_price, quote_only: lead.estimated_price == null,
  };
}
// The pricing.js quote() for a stored lead (used to answer a repeated submission).
function quoteForLead(lead) {
  if (!lead || !PRICING.services[lead.service_type]) return null;
  return quote({
    service: lead.service_type, size: lead.bedrooms == null ? undefined : String(lead.bedrooms), frequency: lead.frequency,
    addons: lead.addons || '', organizingHours: lead.organizing_hours,
  });
}
function validRequestId(v) {
  const id = str(v, 100);
  return id && /^[A-Za-z0-9_.:-]{6,100}$/.test(id) ? id : null;
}

function createService({ db, notifier, config }) {
  const q = (sql) => db.prepare(sql);

  // ---------- customers ----------
  function customerInput(body, { partial = false } = {}) {
    const data = {
      name: str(body.name, 120),
      email: body.email ? normalizeEmail(body.email) : null,
      phone: body.phone ? normalizePhone(body.phone) : null,
      address: str(body.address, 250),
      city: str(body.city, 80),
      zip: str(body.zip, 12),
      notes: str(body.notes, 5000),
      marketing_opt_in: bool(body.marketing_opt_in) ? 1 : 0,
    };
    if (!partial && !data.name) throw new HttpError(400, 'Name is required');
    if (body.email && !data.email) throw new HttpError(400, 'Email address looks invalid');
    if (body.phone && !data.phone) throw new HttpError(400, 'Phone number looks invalid');
    return data;
  }

  function getCustomer(id) {
    const c = q('SELECT * FROM customers WHERE id = ?').get(id);
    if (!c) throw new HttpError(404, 'Customer not found');
    return c;
  }

  function createCustomer(body, source = 'admin') {
    const d = customerInput(body);
    const r = q(`INSERT INTO customers (name, email, phone, address, city, zip, notes, marketing_opt_in, source)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(d.name, d.email, d.phone, d.address, d.city, d.zip, d.notes, d.marketing_opt_in, source);
    return getCustomer(r.lastInsertRowid);
  }

  function updateCustomer(id, body) {
    getCustomer(id);
    const d = customerInput(body);
    q(`UPDATE customers SET name=?, email=?, phone=?, address=?, city=?, zip=?, notes=?, marketing_opt_in=?,
       updated_at=datetime('now') WHERE id=?`)
      .run(d.name, d.email, d.phone, d.address, d.city, d.zip, d.notes, d.marketing_opt_in, id);
    return getCustomer(id);
  }

  function findCustomerByContact(email, phone) {
    return (email && q('SELECT * FROM customers WHERE email = ? ORDER BY id LIMIT 1').get(email))
      || (phone && q('SELECT * FROM customers WHERE phone = ? ORDER BY id LIMIT 1').get(phone))
      || null;
  }

  function listCustomers({ q: search, opted_in } = {}) {
    const where = [];
    const params = [];
    if (search) {
      const like = `%${search.trim().toLowerCase()}%`;
      const digits = search.replace(/\D/g, '');
      where.push(`(lower(name) LIKE ? OR lower(email) LIKE ? OR lower(address) LIKE ?${digits ? ' OR phone LIKE ?' : ''})`);
      params.push(like, like, like);
      if (digits) params.push(`%${digits}%`);
    }
    if (opted_in) where.push('marketing_opt_in = 1');
    return q(`SELECT c.*, (SELECT COUNT(*) FROM jobs j WHERE j.customer_id = c.id) AS job_count
              FROM customers c ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
              ORDER BY c.created_at DESC, c.id DESC LIMIT 1000`).all(...params);
  }

  // ---------- leads ----------
  function getLead(id) {
    const l = q('SELECT * FROM leads WHERE id = ?').get(id);
    if (!l) throw new HttpError(404, 'Lead not found');
    return l;
  }

  // Contact details shared by every public form. preferred_contact must match a channel they gave us.
  function contactInput(body, { nameRequired = true } = {}) {
    const name = str(body.name, 120);
    const email = body.email ? normalizeEmail(body.email) : null;
    const phone = body.phone ? normalizePhone(body.phone) : null;
    if (nameRequired && !name) throw new HttpError(400, 'Please enter your name');
    if (body.email && !email) throw new HttpError(400, 'Please enter a valid email address');
    if (body.phone && !phone) throw new HttpError(400, 'Please enter a valid phone number');
    if (!email && !phone) throw new HttpError(400, 'Please enter a phone number or email so we can reach you');
    let preferred_contact = null;
    if (body.preferred_contact) {
      preferred_contact = String(body.preferred_contact).trim().toLowerCase();
      if (!CONTACT_METHODS.includes(preferred_contact)) throw new HttpError(400, 'Preferred contact must be phone, text or email');
      if (preferred_contact === 'email' && !email) throw new HttpError(400, 'Please enter your email address so we can email you');
      if (preferred_contact !== 'email' && !phone) throw new HttpError(400, 'Please enter your phone number so we can call or text you');
    }
    return { name, email, phone, preferred_contact };
  }

  // Creates or updates the client record for a contact. Marketing is only ever turned ON here,
  // and only when the person ticked the separate marketing box (or signed up for the newsletter).
  function upsertCustomer({ name, email, phone, address = null, zip = null, marketing = 0 }, source) {
    const customer = findCustomerByContact(email, phone);
    if (customer) {
      q(`UPDATE customers SET email = COALESCE(email, ?), phone = COALESCE(phone, ?), address = COALESCE(address, ?),
         zip = COALESCE(zip, ?),
         marketing_opt_in_at = CASE WHEN ? = 1 AND marketing_opt_in = 0 THEN datetime('now') ELSE marketing_opt_in_at END,
         marketing_opt_in = MAX(marketing_opt_in, ?), updated_at = datetime('now') WHERE id = ?`)
        .run(email, phone, address, zip, marketing, marketing, customer.id);
      return customer.id;
    }
    return Number(q(`INSERT INTO customers (name, email, phone, address, zip, marketing_opt_in, marketing_opt_in_at, source)
                     VALUES (?, ?, ?, ?, ?, ?, ${marketing ? "datetime('now')" : 'NULL'}, ?)`)
      .run(name || email || phone, email, phone, address, zip, marketing, source).lastInsertRowid);
  }

  // An earlier copy of the same submission: the same request_id, or (when checkWindow) the same
  // email/phone asking for the same service from the same form within the last 2 minutes.
  function findDuplicateLead({ request_id, email, phone, service_type, source, checkWindow }) {
    if (request_id) {
      const same = q('SELECT * FROM leads WHERE request_id = ?').get(request_id);
      if (same) return same;
    }
    if (!checkWindow || (!email && !phone)) return null;
    return q(`SELECT * FROM leads WHERE source = ? AND service_type IS ? AND created_at >= datetime('now', '${DUPLICATE_WINDOW}')
              AND ((? IS NOT NULL AND email = ?) OR (? IS NOT NULL AND phone = ?)) ORDER BY id LIMIT 1`)
      .get(source, service_type, email, email, phone, phone) || null;
  }

  // Saves a quote request. The customer record is created/updated first so
  // contact info is never lost, even if alerts fail afterwards.
  // The price is ALWAYS recalculated here from public/pricing.js.
  function createLead(body, source = 'website', opts = {}) {
    return submitLead(body, source, opts).lead;
  }

  // Like createLead, but also says whether it repeated an earlier submission: { lead, duplicate, quote }.
  // opts.dedupe: also treat the same contact + service within 2 minutes as a repeat (public forms).
  // opts.priced = false: store service_type as plain text without pricing (the contact form's "interest").
  function submitLead(body, source = 'website', { dedupe = false, priced = true } = {}) {
    const contact = contactInput(body);
    const request_id = validRequestId(body.request_id);
    const p = priced ? priceRequest(body)
      : { service_type: str(body.service_type, 60), frequency: null, bedrooms: null, addons: [], organizing_hours: null, quote: null };
    const bd = breakdownOf(p.quote);
    const lead = {
      ...contact,
      address: str(body.address, 250),
      zip: str(body.zip, 12),
      service_type: p.service_type,
      bedrooms: p.bedrooms,
      bathrooms: num(body.bathrooms),
      sqft: num(body.sqft),
      frequency: p.frequency,
      addons: p.addons.length ? p.addons.join(',') : null,
      organizing_hours: p.organizing_hours,
      preferred_date: str(body.preferred_date, 40),
      preferred_time: str(body.preferred_time, 40),
      referred_by: str(body.referred_by, 120),
      gift_code: str(body.gift_code, 60),
      message: str(body.message, 5000),
      marketing_opt_in: bool(body.marketing_opt_in) ? 1 : 0,
      estimated_price: bd ? bd.total : null,
      price_lines: bd ? JSON.stringify(bd.lines) : null,
      price_subtotal: bd ? bd.subtotal : null,
      price_discount: bd ? bd.discount : null,
      travel_fee: bd ? bd.travel_fee : null,
    };
    const dup = findDuplicateLead({ request_id, email: lead.email, phone: lead.phone, service_type: lead.service_type, source, checkWindow: dedupe });
    if (dup) return { lead: dup, duplicate: true, quote: quoteForLead(dup) };

    db.exec('BEGIN');
    try {
      const customerId = upsertCustomer({ name: lead.name, email: lead.email, phone: lead.phone, address: lead.address, zip: lead.zip, marketing: lead.marketing_opt_in }, source);
      const cols = ['customer_id', 'name', 'email', 'phone', 'address', 'zip', 'service_type', 'bedrooms', 'bathrooms', 'sqft', 'frequency',
        'addons', 'organizing_hours', 'preferred_contact', 'preferred_date', 'preferred_time', 'referred_by', 'gift_code', 'estimated_price',
        'price_lines', 'price_subtotal', 'price_discount', 'travel_fee', 'message', 'marketing_opt_in', 'source', 'request_id'];
      const row = { ...lead, customer_id: customerId, source, request_id };
      const r = q(`INSERT INTO leads (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => row[c] ?? null));
      db.exec('COMMIT');
      return { lead: getLead(r.lastInsertRowid), duplicate: false, quote: p.quote };
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  // Newsletter sign-up: besides the separate marketing checkbox, the only way someone is opted into marketing.
  function subscribe(body, source = 'newsletter') {
    const email = body.email ? normalizeEmail(body.email) : null;
    if (!email) throw new HttpError(400, 'Please enter a valid email address');
    if (!(body.consent === true || body.consent === 'true' || body.consent === 'on')) {
      throw new HttpError(400, 'Please tick the box to agree to receive emails from us');
    }
    const existing = q('SELECT * FROM customers WHERE email = ? ORDER BY id LIMIT 1').get(email);
    const already = Boolean(existing && existing.marketing_opt_in);
    const id = upsertCustomer({ name: str(body.name, 120), email, phone: null, marketing: 1 }, source);
    return { customer: getCustomer(id), duplicate: already };
  }

  function updateLead(id, body) {
    const lead = getLead(id);
    const status = body.status !== undefined ? body.status : lead.status;
    if (!LEAD_STATUSES.includes(status)) throw new HttpError(400, `Status must be one of: ${LEAD_STATUSES.join(', ')}`);
    const fields = ['name', 'address', 'zip', 'preferred_date', 'message'];
    const next = { ...lead, status };
    for (const f of fields) if (body[f] !== undefined) next[f] = str(body[f], f === 'message' ? 5000 : 250);
    if (body.email !== undefined) next.email = body.email ? normalizeEmail(body.email) : null;
    if (body.phone !== undefined) next.phone = body.phone ? normalizePhone(body.phone) : null;
    if (body.estimated_price !== undefined) next.estimated_price = num(body.estimated_price);
    if (!next.name) throw new HttpError(400, 'Name is required');
    q(`UPDATE leads SET status=?, name=?, email=?, phone=?, address=?, zip=?, preferred_date=?, message=?, estimated_price=?,
       updated_at=datetime('now') WHERE id=?`)
      .run(next.status, next.name, next.email, next.phone, next.address, next.zip, next.preferred_date, next.message,
        next.estimated_price, id);
    return getLead(id);
  }

  function listLeads({ status, q: search } = {}) {
    const where = [];
    const params = [];
    if (status && status !== 'all') { where.push('l.status = ?'); params.push(status); }
    if (search) {
      const like = `%${search.trim().toLowerCase()}%`;
      where.push('(lower(l.name) LIKE ? OR lower(l.email) LIKE ? OR l.phone LIKE ? OR lower(l.address) LIKE ?)');
      params.push(like, like, `%${search.replace(/\D/g, '') || search}%`, like);
    }
    return q(`SELECT l.*, (SELECT MAX(created_at) FROM messages m WHERE m.lead_id = l.id AND m.direction = 'out') AS last_contacted_at,
              (SELECT COUNT(*) FROM messages m WHERE m.lead_id = l.id AND m.direction = 'in') AS reply_count,
              EXISTS (SELECT 1 FROM chat_sessions c WHERE c.lead_id = l.id) AS has_chat
              FROM leads l ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
              ORDER BY (l.callback_requested = 1 AND l.status = 'new') DESC, l.created_at DESC, l.id DESC LIMIT 1000`).all(...params);
  }

  // ---------- messaging ----------
  // channel: email | sms (sent by Twilio if configured) | gvoice (you sent it in Google Voice; we log it)
  //          | sms_in (you're logging a text the customer sent you) | note
  async function sendMessage({ leadId = null, customerId = null, channel, subject, body }) {
    const text = str(body, 5000);
    if (!text) throw new HttpError(400, 'Message cannot be empty');
    if (!['email', 'sms', 'gvoice', 'sms_in', 'chat', 'note'].includes(channel)) throw new HttpError(400, 'Channel must be email, sms, gvoice, sms_in, chat, or note');
    const lead = leadId ? getLead(leadId) : null;
    const customer = customerId ? getCustomer(customerId) : lead && lead.customer_id ? q('SELECT * FROM customers WHERE id = ?').get(lead.customer_id) : null;
    const contact = { email: (lead && lead.email) || (customer && customer.email), phone: (lead && lead.phone) || (customer && customer.phone) };
    const cid = customer ? customer.id : null;

    const insert = q(`INSERT INTO messages (lead_id, customer_id, direction, channel, subject, body, status, error)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    if (channel === 'note') {
      const r = insert.run(leadId, cid, 'note', 'note', null, text, 'logged', null);
      return q('SELECT * FROM messages WHERE id = ?').get(r.lastInsertRowid);
    }
    if (channel === 'chat') {
      // Reply shown live in the customer's website chat window (it checks for new messages every few seconds).
      const session = lead && q('SELECT * FROM chat_sessions WHERE lead_id = ? ORDER BY id DESC LIMIT 1').get(lead.id);
      if (!session) throw new HttpError(400, 'This lead has no website chat');
      const now = Date.now();
      // The AI assistant waits while you're chatting; the customer's session stays open so they can answer.
      q('UPDATE chat_sessions SET admin_active_at = ?, expires_at = MAX(expires_at, ?) WHERE id = ?').run(now, now + 7 * 24 * 60 * 60 * 1000, session.id);
      const r = insert.run(leadId, cid, 'out', 'chat', null, text, 'sent', null);
      if (lead.status === 'new') q(`UPDATE leads SET status = 'contacted', updated_at = datetime('now') WHERE id = ?`).run(lead.id);
      const message = q('SELECT * FROM messages WHERE id = ?').get(r.lastInsertRowid);
      // Customer isn't on the website right now: email the reply too, so it's never missed.
      const away = !session.last_seen_at || now - session.last_seen_at > CHAT_AWAY_MS;
      if (away && session.email) {
        const result = await notifier.deliver({
          kind: 'chat_reply_email', channel: 'email', to: session.email, leadId,
          payload: {
            subject: `${config.businessName} replied to your chat`,
            text: `Hi ${String(session.name || '').split(' ')[0] || 'there'},\n\nYou have a reply in the chat on our website:\n\n"${text}"\n\n`
              + `Reply to this email, open the chat on our website, or call or text ${config.businessPhone}.\n\n— ${config.businessName}`,
          },
        });
        message.emailed = result.ok || Boolean(result.retrying);
        message.email_error = message.emailed ? null : result.error;
      }
      return message;
    }
    if (channel === 'gvoice' || channel === 'sms_in') {
      const outbound = channel === 'gvoice';
      const r = insert.run(leadId, cid, outbound ? 'out' : 'in', 'sms', null, text, outbound ? 'gvoice' : 'received', null);
      if (outbound && lead && lead.status === 'new') {
        q(`UPDATE leads SET status = 'contacted', updated_at = datetime('now') WHERE id = ?`).run(lead.id);
      }
      return q('SELECT * FROM messages WHERE id = ?').get(r.lastInsertRowid);
    }
    const to = channel === 'email' ? contact.email : contact.phone;
    if (!to) throw new HttpError(400, `This contact has no ${channel === 'email' ? 'email address' : 'phone number'}`);
    const subj = channel === 'email' ? (str(subject, 200) || `Your ${config.businessName} quote`) : null;
    const result = await notifier.deliver({
      kind: 'admin_reply', channel, to, leadId, retry: false,
      payload: channel === 'email' ? { subject: subj, text } : { body: text },
    });
    const r = insert.run(leadId, cid, 'out', channel, subj, text, result.status, result.error || null);
    if (result.ok && lead && lead.status === 'new') {
      q(`UPDATE leads SET status = 'contacted', updated_at = datetime('now') WHERE id = ?`).run(lead.id);
    }
    const message = q('SELECT * FROM messages WHERE id = ?').get(r.lastInsertRowid);
    if (!result.ok) throw Object.assign(new HttpError(502, `Message not sent: ${result.error}`), { message_record: message });
    return message;
  }

  function listMessages({ leadId, customerId }) {
    if (leadId) return q('SELECT * FROM messages WHERE lead_id = ? ORDER BY created_at, id').all(leadId);
    return q('SELECT * FROM messages WHERE customer_id = ? ORDER BY created_at, id').all(customerId);
  }

  async function recordInboundSms({ from, body }) {
    const phone = normalizePhone(from) || from;
    const customer = q('SELECT * FROM customers WHERE phone = ? ORDER BY id LIMIT 1').get(phone);
    const lead = q('SELECT * FROM leads WHERE phone = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(phone);
    let leadId = lead ? lead.id : null;
    let customerId = customer ? customer.id : lead ? lead.customer_id : null;
    if (!customer && !lead) {
      // Unknown number texted the business line — treat it as a new lead.
      const created = createLead({ name: `Text from ${formatPhone(phone)}`, phone, message: body }, 'sms');
      leadId = created.id;
      customerId = created.customer_id;
      notifier.newLead(created).catch(() => {});
    }
    q(`INSERT INTO messages (lead_id, customer_id, direction, channel, body, status) VALUES (?, ?, 'in', 'sms', ?, 'received')`)
      .run(leadId, customerId, str(body, 5000) || '(empty)');
    if (customer || lead) {
      await notifier.inboundReply({ fromName: (customer && customer.name) || (lead && lead.name), from: phone, body, leadId });
    }
    return { leadId, customerId };
  }

  // ---------- employees ----------
  function employeeInput(body) {
    const d = {
      name: str(body.name, 120),
      email: body.email ? normalizeEmail(body.email) : null,
      phone: body.phone ? normalizePhone(body.phone) : null,
      role: str(body.role, 60) || 'Cleaner',
      active: body.active === undefined ? 1 : bool(body.active) ? 1 : 0,
      notes: str(body.notes, 5000),
    };
    if (!d.name) throw new HttpError(400, 'Name is required');
    if (body.email && !d.email) throw new HttpError(400, 'Email address looks invalid');
    if (body.phone && !d.phone) throw new HttpError(400, 'Phone number looks invalid');
    return d;
  }

  function getEmployee(id) {
    const e = q('SELECT * FROM employees WHERE id = ?').get(id);
    if (!e) throw new HttpError(404, 'Employee not found');
    return e;
  }

  function createEmployee(body) {
    const d = employeeInput(body);
    const r = q('INSERT INTO employees (name, email, phone, role, active, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(d.name, d.email, d.phone, d.role, d.active, d.notes);
    return getEmployee(r.lastInsertRowid);
  }

  function updateEmployee(id, body) {
    getEmployee(id);
    const d = employeeInput(body);
    q(`UPDATE employees SET name=?, email=?, phone=?, role=?, active=?, notes=?, updated_at=datetime('now') WHERE id=?`)
      .run(d.name, d.email, d.phone, d.role, d.active, d.notes, id);
    return getEmployee(id);
  }

  function listEmployees() {
    return q(`SELECT e.*, (SELECT COUNT(*) FROM job_assignments a JOIN jobs j ON j.id = a.job_id
              WHERE a.employee_id = e.id AND j.status = 'scheduled' AND j.scheduled_at >= strftime('%Y-%m-%dT%H:%M', 'now', 'localtime')) AS upcoming_jobs
              FROM employees e ORDER BY e.active DESC, e.name`).all();
  }

  // ---------- jobs ----------
  function hydrateJob(job) {
    job.employees = q(`SELECT e.id, e.name, e.phone, e.email FROM job_assignments a JOIN employees e ON e.id = a.employee_id
                       WHERE a.job_id = ? ORDER BY e.name`).all(job.id);
    job.customer = q('SELECT id, name, phone, email, address FROM customers WHERE id = ?').get(job.customer_id) || null;
    job.property = job.property_id ? q('SELECT id, name, address FROM properties WHERE id = ?').get(job.property_id) || null : null;
    if (typeof job.price_breakdown === 'string') { try { job.price_breakdown = JSON.parse(job.price_breakdown); } catch { job.price_breakdown = null; } }
    return job;
  }

  function getJob(id) {
    const j = q('SELECT * FROM jobs WHERE id = ?').get(id);
    if (!j) throw new HttpError(404, 'Job not found');
    return hydrateJob(j);
  }

  function jobInput(body) {
    const customer_id = num(body.customer_id);
    if (!customer_id) throw new HttpError(400, 'Choose a customer');
    getCustomer(customer_id);
    const scheduled_at = str(body.scheduled_at, 16);
    if (!scheduled_at || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduled_at)) throw new HttpError(400, 'Pick a date and time');
    const status = body.status || 'scheduled';
    if (!JOB_STATUSES.includes(status)) throw new HttpError(400, `Status must be one of: ${JOB_STATUSES.join(', ')}`);
    const employee_ids = [...new Set((Array.isArray(body.employee_ids) ? body.employee_ids : []).map(Number).filter(Boolean))];
    for (const eid of employee_ids) getEmployee(eid);
    if (num(body.lead_id)) getLead(num(body.lead_id));
    // Turnover jobs belong to one of the host's rental properties.
    const property_id = num(body.property_id);
    if (property_id && !q('SELECT 1 FROM properties WHERE id = ? AND customer_id = ?').get(property_id, customer_id)) {
      throw new HttpError(400, "That property doesn't belong to this client");
    }
    return {
      customer_id,
      lead_id: num(body.lead_id),
      property_id,
      scheduled_at,
      duration_hours: num(body.duration_hours) || 3,
      address: str(body.address, 250),
      service_type: str(body.service_type, 60),
      price: num(body.price),
      status,
      notes: str(body.notes, 5000),
      employee_ids,
    };
  }

  async function notifyAssigned(job, employeeIds, { changed = false } = {}) {
    const when = fmtLocal(job.scheduled_at);
    const address = job.address || (job.customer && job.customer.address) || 'address TBD';
    const text = `${config.businessName}: ${changed ? 'Schedule change: your cleaning job is now' : "You're assigned a cleaning job"} ${when} at ${address}`
      + ` for ${job.customer ? job.customer.name : 'a customer'}${job.service_type ? ` (${job.service_type})` : ''}.`
      + `${job.notes ? ` Notes: ${job.notes}` : ''}`;
    const results = [];
    for (const eid of employeeIds) {
      const e = getEmployee(eid);
      if (e.phone && notifier.senders.smsEnabled) results.push(await notifier.deliver({ kind: 'job_assigned', channel: 'sms', to: e.phone, payload: { body: text } }));
      if (e.email) results.push(await notifier.deliver({ kind: 'job_assigned', channel: 'email', to: e.email, payload: { subject: `${changed ? 'Job moved' : 'New job assignment'} — ${when}`, text } }));
    }
    return results;
  }

  // Booking emails to the client: "booked" when a job is made, "moved" when its date, time or address
  // changes, "cancelled" when it's cancelled. Also saved in the client's conversation so you can see it went.
  async function notifyCustomer(job, kind) {
    const customer = job.customer_id ? q('SELECT * FROM customers WHERE id = ?').get(job.customer_id) : null;
    const account = customer ? q('SELECT email, is_host FROM portal_accounts WHERE customer_id = ? AND enabled = 1').get(customer.id) : null;
    const to = (customer && customer.email) || (account && account.email);
    if (!to) return { ok: false, status: 'skipped', error: 'This client has no email address' };
    const when = fmtLocal(job.scheduled_at, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const first = String(customer.name || '').trim().split(/\s+/)[0] || 'there';
    const cleaners = (job.employees || []).map((e) => String(e.name).split(/\s+/)[0]);
    const lines = (job.price_breakdown && job.price_breakdown.lines) || null;
    const details = [
      `When: ${when}${job.duration_hours ? ` (about ${job.duration_hours} hour${job.duration_hours === 1 ? '' : 's'})` : ''}`,
      job.address && `Where: ${job.address}`,
      job.service_type && `Service: ${job.service_type}`,
      lines && lines.length
        ? `Price:\n${lines.map((l) => `  • ${l.kind === 'travel' || l.kind === 'included' ? l.label : `${l.label}: ${l.amount < 0 ? '−' : ''}$${Math.abs(l.amount)}`}`).join('\n')}${job.price != null ? `\n  Total: $${job.price}` : ''}`
        : job.price != null && `Price: $${job.price}`,
      cleaners.length && `Your cleaner${cleaners.length > 1 ? 's' : ''}: ${cleaners.join(', ')}`,
    ].filter(Boolean).join('\n');
    const portal = account ? `\n\nSee your bookings any time: ${config.publicUrl}/${account.is_host ? 'host/turnovers' : 'portal/bookings'}` : '';
    const contact = `Need to change something? Reply to this email or call or text ${config.businessPhone}.`;
    const subjects = {
      booked: `You're booked: ${fmtLocal(job.scheduled_at)}`,
      moved: `New time for your cleaning: ${fmtLocal(job.scheduled_at)}`,
      cancelled: `Your cleaning on ${fmtLocal(job.scheduled_at)} is cancelled`,
    };
    const intros = {
      booked: 'Your cleaning is confirmed. Here are the details:',
      moved: 'Your cleaning has a new date or time. Here are the updated details:',
      cancelled: `Your cleaning on ${when} is cancelled. If that's a mistake, just reply and we'll put you back on the schedule.`,
    };
    const subject = `${subjects[kind]} — ${config.businessName}`;
    const text = `Hi ${first},\n\n${intros[kind]}${kind === 'cancelled' ? '' : `\n\n${details}`}${portal}\n\n${contact}\n\nThank you!\n— ${config.businessName}`;
    const result = await notifier.deliver({ kind: `booking_${kind}`, channel: 'email', to, leadId: job.lead_id || null, payload: { subject, text } });
    q(`INSERT INTO messages (lead_id, customer_id, direction, channel, subject, body, status, error) VALUES (?, ?, 'out', 'email', ?, ?, ?, ?)`)
      .run(job.lead_id || null, customer.id, subject, text, result.ok ? 'sent' : result.retrying ? 'retrying' : result.status, result.error || null);
    return { ok: result.ok, retrying: Boolean(result.retrying), status: result.retrying ? 'retrying' : result.status, error: result.error || null, to };
  }
  const wantsCustomerEmail = (body) => bool(body.notify_customer);

  function saveAssignments(jobId, employeeIds) {
    const before = q('SELECT employee_id FROM job_assignments WHERE job_id = ?').all(jobId).map((r) => r.employee_id);
    q('DELETE FROM job_assignments WHERE job_id = ?').run(jobId);
    const ins = q('INSERT INTO job_assignments (job_id, employee_id) VALUES (?, ?)');
    for (const eid of employeeIds) ins.run(jobId, eid);
    return employeeIds.filter((id) => !before.includes(id));
  }

  // Cleaners who already have another scheduled job overlapping this time. A warning, never a block.
  const toMinutes = (local) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : null;
  };
  function findConflicts({ employee_ids = [], scheduled_at, duration_hours = 3, exclude_job_id = null }) {
    const start = toMinutes(scheduled_at);
    if (start == null) return [];
    const end = start + (Number(duration_hours) || 3) * 60;
    const day = scheduled_at.slice(0, 10);
    const rows = q(`SELECT j.id, j.scheduled_at, j.duration_hours, j.address, j.service_type, e.id AS employee_id, e.name AS employee_name,
                    c.name AS customer_name
                    FROM job_assignments a JOIN jobs j ON j.id = a.job_id JOIN employees e ON e.id = a.employee_id
                    LEFT JOIN customers c ON c.id = j.customer_id
                    WHERE j.status = 'scheduled' AND j.id IS NOT ? AND a.employee_id IN (${employee_ids.map(() => '?').join(',') || 'NULL'})
                    AND substr(j.scheduled_at, 1, 10) BETWEEN date(?, '-1 day') AND date(?, '+1 day')`)
      .all(exclude_job_id, ...employee_ids.map(Number), day, day);
    return rows.filter((r) => {
      const s = toMinutes(r.scheduled_at);
      return s != null && s < end && start < s + (Number(r.duration_hours) || 3) * 60;
    }).map((r) => ({
      employee_id: r.employee_id, employee_name: r.employee_name, job_id: r.id, scheduled_at: r.scheduled_at, duration_hours: r.duration_hours,
      message: `${r.employee_name} already has a job at ${r.scheduled_at.replace('T', ' ')} (${r.duration_hours} h${r.customer_name ? `, ${r.customer_name}` : ''}).`,
    }));
  }

  // Quick booking for someone who isn't a client yet: the booking form can send their details instead of
  // a customer_id. An existing client with the same email or phone is reused, never duplicated.
  function clientForBooking(body) {
    if (num(body.customer_id) || !body.new_customer || typeof body.new_customer !== 'object') return body;
    const nc = customerInput(body.new_customer);
    if (!nc.email && !nc.phone) throw new HttpError(400, "Add the new client's phone or email so they can be reached");
    const existing = findCustomerByContact(nc.email, nc.phone);
    const customer = existing || createCustomer(body.new_customer, 'admin');
    if (existing && !existing.address && nc.address) q(`UPDATE customers SET address = ?, updated_at = datetime('now') WHERE id = ?`).run(nc.address, existing.id);
    return { ...body, customer_id: customer.id };
  }

  async function createJob(input) {
    const body = clientForBooking(input);
    const d = jobInput(body);
    const cust = getCustomer(d.customer_id);
    const prop = d.property_id ? q('SELECT address FROM properties WHERE id = ?').get(d.property_id) : null;
    // Booking from a lead carries its estimate: price, service and the itemized breakdown.
    const lead = d.lead_id ? getLead(d.lead_id) : null;
    const breakdown = leadBreakdown(lead);
    const price = d.price != null ? d.price : lead ? lead.estimated_price : null;
    const service = d.service_type || (lead && lead.service_type ? (PRICING.services[lead.service_type] ? PRICING.services[lead.service_type].label : lead.service_type) : null);
    const r = q(`INSERT INTO jobs (customer_id, lead_id, property_id, scheduled_at, duration_hours, address, service_type, price, status, notes, price_breakdown)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(d.customer_id, d.lead_id, d.property_id, d.scheduled_at, d.duration_hours, d.address || (prop && prop.address) || cust.address,
        service, price, d.status, d.notes, breakdown ? JSON.stringify(breakdown) : null);
    const id = r.lastInsertRowid;
    const added = saveAssignments(id, d.employee_ids);
    if (d.lead_id) q(`UPDATE leads SET status = 'booked', updated_at = datetime('now') WHERE id = ?`).run(d.lead_id);
    const job = getJob(id);
    job.warnings = findConflicts({ employee_ids: d.employee_ids, scheduled_at: d.scheduled_at, duration_hours: d.duration_hours, exclude_job_id: id });
    if (body.notify_employees !== false && added.length) job.notifications = await notifyAssigned(job, added);
    if (wantsCustomerEmail(body) && job.status === 'scheduled') job.customer_notification = await notifyCustomer(job, 'booked');
    return job;
  }

  async function updateJob(id, body) {
    const before = getJob(id);
    const d = jobInput(body);
    // Keep the address when the form leaves it blank, like a new booking does.
    const address = d.address || before.address || (d.property_id && (q('SELECT address FROM properties WHERE id = ?').get(d.property_id) || {}).address) || getCustomer(d.customer_id).address;
    q(`UPDATE jobs SET customer_id=?, lead_id=?, property_id=?, scheduled_at=?, duration_hours=?, address=?, service_type=?, price=?, status=?, notes=?,
       updated_at=datetime('now') WHERE id=?`)
      .run(d.customer_id, d.lead_id, d.property_id, d.scheduled_at, d.duration_hours, address, d.service_type, d.price, d.status, d.notes, id);
    const added = saveAssignments(id, d.employee_ids);
    const job = getJob(id);
    job.warnings = d.status === 'scheduled'
      ? findConflicts({ employee_ids: d.employee_ids, scheduled_at: d.scheduled_at, duration_hours: d.duration_hours, exclude_job_id: Number(id) })
      : [];
    if (body.notify_employees !== false && added.length) job.notifications = await notifyAssigned(job, added);
    if (wantsCustomerEmail(body)) {
      const kind = job.status === 'cancelled' && before.status !== 'cancelled' ? 'cancelled'
        : job.status === 'scheduled' && before.status !== 'scheduled' ? 'booked'
          : job.status === 'scheduled' && (job.scheduled_at !== before.scheduled_at || (job.address || '') !== (before.address || '')) ? 'moved'
            : null;
      if (kind) job.customer_notification = await notifyCustomer(job, kind);
    }
    return job;
  }

  function listJobs({ from, to, employee_id, status, customer_id, property_id } = {}) {
    const where = [];
    const params = [];
    if (from) { where.push('j.scheduled_at >= ?'); params.push(from); }
    if (to) { where.push('j.scheduled_at < ?'); params.push(to); }
    if (status && status !== 'all') { where.push('j.status = ?'); params.push(status); }
    if (customer_id) { where.push('j.customer_id = ?'); params.push(Number(customer_id)); }
    if (property_id) { where.push('j.property_id = ?'); params.push(Number(property_id)); }
    if (employee_id) { where.push('j.id IN (SELECT job_id FROM job_assignments WHERE employee_id = ?)'); params.push(Number(employee_id)); }
    return q(`SELECT j.* FROM jobs j ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY j.scheduled_at LIMIT 2000`)
      .all(...params).map(hydrateJob);
  }

  // ---------- dashboard ----------
  function stats() {
    const one = (sql, ...p) => Object.values(q(sql).get(...p))[0];
    return {
      customers: one('SELECT COUNT(*) FROM customers'),
      new_leads: one(`SELECT COUNT(*) FROM leads WHERE status = 'new'`),
      callbacks: one(`SELECT COUNT(*) FROM leads WHERE callback_requested = 1 AND status = 'new'`),
      open_leads: one(`SELECT COUNT(*) FROM leads WHERE status IN ('new', 'contacted', 'quoted')`),
      leads_this_week: one(`SELECT COUNT(*) FROM leads WHERE created_at >= datetime('now', '-7 days')`),
      upcoming_jobs: one(`SELECT COUNT(*) FROM jobs WHERE status = 'scheduled' AND scheduled_at >= strftime('%Y-%m-%dT%H:%M', 'now', 'localtime')`),
      unassigned_jobs: one(`SELECT COUNT(*) FROM jobs j WHERE status = 'scheduled' AND NOT EXISTS (SELECT 1 FROM job_assignments a WHERE a.job_id = j.id)`),
      active_employees: one('SELECT COUNT(*) FROM employees WHERE active = 1'),
      unread_replies: one(`SELECT COUNT(*) FROM messages m WHERE direction = 'in' AND created_at >= datetime('now', '-7 days')`),
      pending_requests: one(`SELECT COUNT(*) FROM portal_requests WHERE status = 'pending'`),
      open_invoices: one(`SELECT COUNT(*) FROM invoices WHERE status = 'sent'`),
      failed_alerts: one(`SELECT COUNT(*) FROM notifications WHERE status IN ('failed', 'skipped') AND kind IN ('new_lead', 'contact_message', 'website_form') AND created_at >= datetime('now', '-7 days')`),
      alerts: {
        email_configured: notifier.senders.emailEnabled,
        sms_configured: notifier.senders.smsEnabled,
        alert_emails: config.alertEmails.length,
        alert_phones: config.alertPhones.length,
        google_voice_number: config.googleVoiceNumber,
      },
    };
  }

  return {
    LEAD_STATUSES, JOB_STATUSES,
    createCustomer, updateCustomer, getCustomer, listCustomers,
    createLead, submitLead, subscribe, contactInput, updateLead, getLead, listLeads, leadBreakdown, quoteForLead,
    sendMessage, listMessages, recordInboundSms,
    createEmployee, updateEmployee, getEmployee, listEmployees,
    createJob, updateJob, getJob, listJobs, notifyAssigned, notifyCustomer, findConflicts,
    stats,
  };
}

module.exports = { createService };

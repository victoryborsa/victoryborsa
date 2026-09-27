const { estimatePrice, PRICING } = require('../public/pricing');
const { normalizePhone, normalizeEmail, formatPhone, str, num, bool, HttpError } = require('./util');

const LEAD_STATUSES = ['new', 'contacted', 'quoted', 'booked', 'lost'];
const JOB_STATUSES = ['scheduled', 'completed', 'cancelled'];

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

  // Saves a quote request. The customer record is created/updated first so
  // contact info is never lost, even if alerts fail afterwards.
  function createLead(body, source = 'website') {
    const name = str(body.name, 120);
    const email = body.email ? normalizeEmail(body.email) : null;
    const phone = body.phone ? normalizePhone(body.phone) : null;
    if (!name) throw new HttpError(400, 'Please enter your name');
    if (body.email && !email) throw new HttpError(400, 'Please enter a valid email address');
    if (body.phone && !phone) throw new HttpError(400, 'Please enter a valid phone number');
    if (!email && !phone) throw new HttpError(400, 'Please enter a phone number or email so we can reach you');

    const service_type = PRICING.services[body.service_type] ? body.service_type : null;
    const frequency = PRICING.frequency[body.frequency] ? body.frequency : null;
    const lead = {
      name, email, phone,
      address: str(body.address, 250),
      zip: str(body.zip, 12),
      service_type,
      bedrooms: num(body.bedrooms),
      bathrooms: num(body.bathrooms),
      sqft: num(body.sqft),
      frequency,
      preferred_date: str(body.preferred_date, 40),
      message: str(body.message, 5000),
      marketing_opt_in: bool(body.marketing_opt_in) ? 1 : 0,
    };
    lead.estimated_price = service_type ? estimatePrice(lead) : num(body.estimated_price);

    db.exec('BEGIN');
    try {
      let customer = findCustomerByContact(email, phone);
      if (customer) {
        q(`UPDATE customers SET email = COALESCE(email, ?), phone = COALESCE(phone, ?), address = COALESCE(address, ?),
           zip = COALESCE(zip, ?), marketing_opt_in = MAX(marketing_opt_in, ?), updated_at = datetime('now') WHERE id = ?`)
          .run(email, phone, lead.address, lead.zip, lead.marketing_opt_in, customer.id);
      } else {
        customer = { id: q(`INSERT INTO customers (name, email, phone, address, zip, marketing_opt_in, source)
                            VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(name, email, phone, lead.address, lead.zip, lead.marketing_opt_in, source).lastInsertRowid };
      }
      const r = q(`INSERT INTO leads (customer_id, name, email, phone, address, zip, service_type, bedrooms, bathrooms, sqft,
                   frequency, preferred_date, estimated_price, message, marketing_opt_in, source)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(customer.id, name, email, phone, lead.address, lead.zip, service_type, lead.bedrooms, lead.bathrooms,
          lead.sqft, frequency, lead.preferred_date, lead.estimated_price, lead.message, lead.marketing_opt_in, source);
      db.exec('COMMIT');
      return getLead(r.lastInsertRowid);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
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
      if (!lead || !q('SELECT 1 FROM chat_sessions WHERE lead_id = ?').get(lead.id)) throw new HttpError(400, 'This lead has no website chat');
      const r = insert.run(leadId, cid, 'out', 'chat', null, text, 'sent', null);
      return q('SELECT * FROM messages WHERE id = ?').get(r.lastInsertRowid);
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
      kind: 'admin_reply', channel, to, leadId,
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
    return {
      customer_id,
      lead_id: num(body.lead_id),
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

  async function notifyAssigned(job, employeeIds) {
    const when = new Date(job.scheduled_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const address = job.address || (job.customer && job.customer.address) || 'address TBD';
    const text = `${config.businessName}: You're assigned a cleaning job ${when} at ${address}`
      + ` for ${job.customer ? job.customer.name : 'a customer'}${job.service_type ? ` (${job.service_type})` : ''}.`
      + `${job.notes ? ` Notes: ${job.notes}` : ''}`;
    const results = [];
    for (const eid of employeeIds) {
      const e = getEmployee(eid);
      if (e.phone && notifier.senders.smsEnabled) results.push(await notifier.deliver({ kind: 'job_assigned', channel: 'sms', to: e.phone, payload: { body: text } }));
      if (e.email) results.push(await notifier.deliver({ kind: 'job_assigned', channel: 'email', to: e.email, payload: { subject: `New job assignment — ${when}`, text } }));
    }
    return results;
  }

  function saveAssignments(jobId, employeeIds) {
    const before = q('SELECT employee_id FROM job_assignments WHERE job_id = ?').all(jobId).map((r) => r.employee_id);
    q('DELETE FROM job_assignments WHERE job_id = ?').run(jobId);
    const ins = q('INSERT INTO job_assignments (job_id, employee_id) VALUES (?, ?)');
    for (const eid of employeeIds) ins.run(jobId, eid);
    return employeeIds.filter((id) => !before.includes(id));
  }

  async function createJob(body) {
    const d = jobInput(body);
    const cust = getCustomer(d.customer_id);
    const r = q(`INSERT INTO jobs (customer_id, lead_id, scheduled_at, duration_hours, address, service_type, price, status, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(d.customer_id, d.lead_id, d.scheduled_at, d.duration_hours, d.address || cust.address, d.service_type, d.price, d.status, d.notes);
    const id = r.lastInsertRowid;
    const added = saveAssignments(id, d.employee_ids);
    if (d.lead_id) q(`UPDATE leads SET status = 'booked', updated_at = datetime('now') WHERE id = ?`).run(d.lead_id);
    const job = getJob(id);
    if (body.notify_employees !== false && added.length) job.notifications = await notifyAssigned(job, added);
    return job;
  }

  async function updateJob(id, body) {
    getJob(id);
    const d = jobInput(body);
    q(`UPDATE jobs SET customer_id=?, lead_id=?, scheduled_at=?, duration_hours=?, address=?, service_type=?, price=?, status=?, notes=?,
       updated_at=datetime('now') WHERE id=?`)
      .run(d.customer_id, d.lead_id, d.scheduled_at, d.duration_hours, d.address, d.service_type, d.price, d.status, d.notes, id);
    const added = saveAssignments(id, d.employee_ids);
    const job = getJob(id);
    if (body.notify_employees !== false && added.length) job.notifications = await notifyAssigned(job, added);
    return job;
  }

  function listJobs({ from, to, employee_id, status, customer_id } = {}) {
    const where = [];
    const params = [];
    if (from) { where.push('j.scheduled_at >= ?'); params.push(from); }
    if (to) { where.push('j.scheduled_at < ?'); params.push(to); }
    if (status && status !== 'all') { where.push('j.status = ?'); params.push(status); }
    if (customer_id) { where.push('j.customer_id = ?'); params.push(Number(customer_id)); }
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
      failed_alerts: one(`SELECT COUNT(*) FROM notifications WHERE status IN ('failed', 'skipped') AND kind = 'new_lead' AND created_at >= datetime('now', '-7 days')`),
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
    createLead, updateLead, getLead, listLeads,
    sendMessage, listMessages, recordInboundSms,
    createEmployee, updateEmployee, getEmployee, listEmployees,
    createJob, updateJob, getJob, listJobs,
    stats,
  };
}

module.exports = { createService };

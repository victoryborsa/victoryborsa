// Client portal (/portal), host portal (/host) and the admin side of both:
// invoices, rental properties, reschedule / cancel / turnover requests, turnover reports with photos.
//
// Every portal query is scoped to the logged-in account's customer_id. Nothing here takes a
// customer id from the browser.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { str, num, normalizePhone, HttpError } = require('./util');

const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void'];
const REQUEST_KINDS = ['reschedule', 'cancel', 'turnover'];
const TURNOVER_SERVICE = 'Airbnb / STR Turnover';
const MAX_PHOTOS = 40;
const IMAGE_TYPES = [
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { type: 'image/gif', ext: 'gif', test: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' },
];
const PHOTO_FILE = /^[a-f0-9]{24}\.(jpg|png|webp|gif)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const fmtWhen = (local) => new Date(local).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtDate = (d) => new Date(`${d}T12:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

function createPortal({ db, config, svc, notifier, accounts }) {
  const q = (sql) => db.prepare(sql);
  const nowLocal = () => q(`SELECT strftime('%Y-%m-%dT%H:%M', 'now', 'localtime') AS n`).get().n;

  // ---------- emails ----------
  const adminLink = (hash) => `${config.publicUrl}/admin#${hash}`;
  function alertAdmin(kind, subject, text, hash) {
    return Promise.all(config.alertEmails.map((to) => notifier.deliver({
      kind, channel: 'email', to, payload: { subject, text: `${text}\n\nOpen in admin: ${adminLink(hash)}` },
    })));
  }
  // Booking / request updates to the client. They can turn these off on their profile page.
  function emailClient(customerId, kind, subject, text, { force = false } = {}) {
    const customer = q('SELECT * FROM customers WHERE id = ?').get(customerId);
    const account = accounts.accountForCustomer(customerId);
    const to = (account && account.email) || (customer && customer.email);
    if (!customer || !to) return Promise.resolve({ ok: false, status: 'skipped', error: 'Client has no email address' });
    if (!force && account && !account.email_updates) return Promise.resolve({ ok: false, status: 'skipped', error: 'Client turned off email updates' });
    const portal = `${config.publicUrl}/${account && account.is_host ? 'host' : 'portal'}`;
    return notifier.deliver({
      kind, channel: 'email', to,
      payload: {
        subject,
        text: `Hi ${firstName(customer.name) || 'there'},\n\n${text}\n\nSee your account: ${portal}\nQuestions? Call or text ${config.businessPhone}.\n\n— ${config.businessName}`,
      },
    });
  }

  // ---------- jobs as the client sees them ----------
  // Only what the client needs: cleaners are first names only (no staff phone numbers or emails).
  function clientJob(j) {
    const cleaners = q(`SELECT e.name FROM job_assignments a JOIN employees e ON e.id = a.employee_id WHERE a.job_id = ? ORDER BY e.name`).all(j.id);
    const property = j.property_id ? q('SELECT id, name FROM properties WHERE id = ?').get(j.property_id) : null;
    const report = q('SELECT id FROM job_reports WHERE job_id = ?').get(j.id);
    const pending = q(`SELECT id, kind, requested_at, note, created_at FROM portal_requests WHERE job_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`).get(j.id);
    return {
      id: j.id, scheduled_at: j.scheduled_at, duration_hours: j.duration_hours, service_type: j.service_type,
      address: j.address, status: j.status, price: j.price,
      property: property || null, cleaners: cleaners.map((c) => firstName(c.name)),
      has_report: Boolean(report), pending_request: pending || null,
    };
  }

  function customerJobs(customerId, { propertyOnly = false } = {}) {
    const now = nowLocal();
    const rows = q(`SELECT * FROM jobs WHERE customer_id = ? ${propertyOnly ? 'AND property_id IS NOT NULL' : ''} ORDER BY scheduled_at`).all(customerId);
    const upcoming = rows.filter((j) => j.status === 'scheduled' && j.scheduled_at >= now).map(clientJob);
    const past = rows.filter((j) => !(j.status === 'scheduled' && j.scheduled_at >= now)).reverse().map(clientJob);
    return { upcoming, past };
  }

  function ownedJob(customerId, jobId) {
    const j = q('SELECT * FROM jobs WHERE id = ? AND customer_id = ?').get(Number(jobId), customerId);
    if (!j) throw new HttpError(404, 'Booking not found');
    return j;
  }

  // ---------- invoices ----------
  function getInvoice(id) {
    const inv = q('SELECT * FROM invoices WHERE id = ?').get(Number(id));
    if (!inv) throw new HttpError(404, 'Invoice not found');
    return inv;
  }

  function hydrateInvoice(inv) {
    const job = inv.job_id ? q('SELECT id, scheduled_at, service_type, address, property_id FROM jobs WHERE id = ?').get(inv.job_id) : null;
    const customer = q('SELECT id, name, email, phone, address, city, zip FROM customers WHERE id = ?').get(inv.customer_id);
    const today = nowLocal().slice(0, 10);
    return { ...inv, job: job || null, customer, overdue: inv.status === 'sent' && inv.due_date && inv.due_date < today ? 1 : 0 };
  }

  function invoiceInput(body, existing) {
    const d = {
      customer_id: existing ? existing.customer_id : num(body.customer_id),
      job_id: body.job_id === undefined && existing ? existing.job_id : num(body.job_id),
      amount: body.amount === undefined && existing ? existing.amount : num(body.amount),
      status: body.status || (existing ? existing.status : 'draft'),
      due_date: body.due_date === undefined && existing ? existing.due_date : str(body.due_date, 10),
      pay_url: body.pay_url === undefined && existing ? existing.pay_url : str(body.pay_url, 500),
      notes: body.notes === undefined && existing ? existing.notes : str(body.notes, 5000),
      number: body.number === undefined && existing ? existing.number : str(body.number, 40),
    };
    if (d.job_id) {
      const job = q('SELECT * FROM jobs WHERE id = ?').get(d.job_id);
      if (!job) throw new HttpError(404, 'Job not found');
      if (!d.customer_id) d.customer_id = job.customer_id;
      if (job.customer_id !== d.customer_id) throw new HttpError(400, "That job belongs to a different client");
      if (d.amount == null && !existing) d.amount = job.price;
    }
    if (!d.customer_id) throw new HttpError(400, 'Choose a client');
    svc.getCustomer(d.customer_id);
    if (d.amount == null || d.amount < 0 || d.amount >= 1000000) throw new HttpError(400, 'Enter the invoice amount');
    d.amount = Math.round(d.amount * 100) / 100;
    if (!INVOICE_STATUSES.includes(d.status)) throw new HttpError(400, `Status must be one of: ${INVOICE_STATUSES.join(', ')}`);
    if (d.due_date && !DATE.test(d.due_date)) throw new HttpError(400, 'Due date must be a date');
    // A Stripe Payment Link (https://buy.stripe.com/...) or any other secure payment page.
    if (d.pay_url) {
      let u;
      try { u = new URL(d.pay_url); } catch { throw new HttpError(400, 'Pay link must be a full web address starting with https://'); }
      if (u.protocol !== 'https:') throw new HttpError(400, 'Pay link must start with https://');
      d.pay_url = u.toString();
    }
    return d;
  }

  function saveInvoice(id, d, existing) {
    try {
      if (!existing) {
        const r = q(`INSERT INTO invoices (customer_id, job_id, number, amount, status, due_date, pay_url, notes, sent_at, paid_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${d.status === 'sent' || d.status === 'paid' ? "datetime('now')" : 'NULL'}, ${d.status === 'paid' ? "datetime('now')" : 'NULL'})`)
          .run(d.customer_id, d.job_id, d.number || `tmp-${crypto.randomBytes(8).toString('hex')}`, d.amount, d.status, d.due_date, d.pay_url, d.notes);
        id = Number(r.lastInsertRowid);
        if (!d.number) q('UPDATE invoices SET number = ? WHERE id = ?').run(`SP-${1000 + id}`, id);
      } else {
        q(`UPDATE invoices SET job_id=?, number=?, amount=?, status=?, due_date=?, pay_url=?, notes=?,
           sent_at = CASE WHEN ? IN ('sent', 'paid') AND sent_at IS NULL THEN datetime('now') ELSE sent_at END,
           paid_at = CASE WHEN ? = 'paid' THEN COALESCE(paid_at, datetime('now')) ELSE NULL END,
           updated_at=datetime('now') WHERE id=?`)
          .run(d.job_id, d.number || existing.number, d.amount, d.status, d.due_date, d.pay_url, d.notes, d.status, d.status, id);
      }
    } catch (err) {
      if (/UNIQUE/.test(err.message)) throw new HttpError(409, 'That invoice number is already used');
      throw err;
    }
    return hydrateInvoice(getInvoice(id));
  }

  const createInvoice = (body) => saveInvoice(null, invoiceInput(body), null);
  function updateInvoice(id, body) {
    const existing = getInvoice(id);
    return saveInvoice(existing.id, invoiceInput(body, existing), existing);
  }

  function listInvoices({ status, customer_id } = {}) {
    const where = [];
    const params = [];
    if (status && status !== 'all') {
      if (status === 'open') where.push("i.status = 'sent'");
      else { where.push('i.status = ?'); params.push(status); }
    }
    if (customer_id) { where.push('i.customer_id = ?'); params.push(Number(customer_id)); }
    return q(`SELECT i.* FROM invoices i ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY i.created_at DESC, i.id DESC LIMIT 1000`)
      .all(...params).map(hydrateInvoice);
  }

  // Emails the client the invoice: amount, due date, Pay now link and a link to view / print it.
  async function sendInvoice(id) {
    let inv = getInvoice(id);
    if (inv.status === 'void') throw new HttpError(400, 'This invoice is void');
    if (inv.status === 'draft') inv = saveInvoice(inv.id, invoiceInput({ status: 'sent' }, inv), inv);
    const account = accounts.accountForCustomer(inv.customer_id);
    const viewLink = `${config.publicUrl}/${account && account.is_host ? 'host' : 'portal'}/invoices/${inv.id}`;
    const text = `Here is invoice ${inv.number} from ${config.businessName} for ${money(inv.amount)}`
      + `${inv.due_date ? `, due ${fmtDate(inv.due_date)}` : ''}.`
      + `${inv.status === 'paid' ? '\n\nThis invoice is paid. Thank you!' : inv.pay_url ? `\n\nPay online: ${inv.pay_url}` : ''}`
      + `\n\nView or print it${account ? '' : ' (log in or set up your client portal with this email address)'}: ${viewLink}`
      + `${inv.notes ? `\n\n${inv.notes}` : ''}`;
    const result = await emailClient(inv.customer_id, 'invoice', `Invoice ${inv.number} from ${config.businessName}: ${money(inv.amount)}`, text, { force: true });
    if (!result.ok) throw new HttpError(502, `Invoice not emailed: ${result.error}`);
    return hydrateInvoice(getInvoice(inv.id));
  }

  // Clients never see drafts.
  function clientInvoices(customerId) {
    return q(`SELECT * FROM invoices WHERE customer_id = ? AND status != 'draft' ORDER BY created_at DESC, id DESC`).all(customerId).map(hydrateInvoice);
  }
  function clientInvoice(customerId, id) {
    const inv = q(`SELECT * FROM invoices WHERE id = ? AND customer_id = ? AND status != 'draft'`).get(Number(id), customerId);
    if (!inv) throw new HttpError(404, 'Invoice not found');
    return hydrateInvoice(inv);
  }

  // ---------- properties ----------
  function propertyInput(body) {
    const d = {
      name: str(body.name, 120),
      address: str(body.address, 250),
      bedrooms: num(body.bedrooms),
      bathrooms: num(body.bathrooms),
      access_notes: str(body.access_notes, 2000),
      checkout_time: str(body.checkout_time, 5),
      checkin_time: str(body.checkin_time, 5),
      notes: str(body.notes, 5000),
    };
    if (!d.name) throw new HttpError(400, 'Give the property a name (for example "Lawrenceville loft")');
    if (!d.address) throw new HttpError(400, 'Enter the property address');
    for (const f of ['checkout_time', 'checkin_time']) if (d[f] && !TIME.test(d[f])) throw new HttpError(400, 'Times must look like 11:00');
    for (const f of ['bedrooms', 'bathrooms']) if (d[f] != null && (d[f] < 0 || d[f] > 50)) throw new HttpError(400, `Check the number of ${f}`);
    return d;
  }

  function getProperty(id) {
    const p = q('SELECT * FROM properties WHERE id = ?').get(Number(id));
    if (!p) throw new HttpError(404, 'Property not found');
    return p;
  }
  function ownedProperty(customerId, id) {
    const p = q('SELECT * FROM properties WHERE id = ? AND customer_id = ?').get(Number(id), customerId);
    if (!p) throw new HttpError(404, 'Property not found');
    return p;
  }

  function createProperty(customerId, body) {
    svc.getCustomer(customerId);
    const d = propertyInput(body);
    const r = q(`INSERT INTO properties (customer_id, name, address, bedrooms, bathrooms, access_notes, checkout_time, checkin_time, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(customerId, d.name, d.address, d.bedrooms, d.bathrooms, d.access_notes, d.checkout_time, d.checkin_time, d.notes);
    return getProperty(r.lastInsertRowid);
  }

  function updateProperty(id, body) {
    const d = propertyInput(body);
    q(`UPDATE properties SET name=?, address=?, bedrooms=?, bathrooms=?, access_notes=?, checkout_time=?, checkin_time=?, notes=?,
       updated_at=datetime('now') WHERE id=?`)
      .run(d.name, d.address, d.bedrooms, d.bathrooms, d.access_notes, d.checkout_time, d.checkin_time, d.notes, id);
    return getProperty(id);
  }

  function listProperties({ customer_id } = {}) {
    const now = nowLocal();
    return q(`SELECT p.*, c.name AS owner_name,
              (SELECT MIN(scheduled_at) FROM jobs j WHERE j.property_id = p.id AND j.status = 'scheduled' AND j.scheduled_at >= ?) AS next_turnover,
              (SELECT COUNT(*) FROM jobs j WHERE j.property_id = p.id) AS turnover_count
              FROM properties p JOIN customers c ON c.id = p.customer_id
              ${customer_id ? 'WHERE p.customer_id = ?' : ''} ORDER BY c.name, p.name`).all(now, ...(customer_id ? [Number(customer_id)] : []));
  }

  // ---------- requests ----------
  function hydrateRequest(r) {
    const customer = q('SELECT id, name, email, phone FROM customers WHERE id = ?').get(r.customer_id);
    const job = r.job_id ? q('SELECT id, scheduled_at, service_type, address, status FROM jobs WHERE id = ?').get(r.job_id) : null;
    const property = r.property_id ? q('SELECT id, name, address, checkout_time, checkin_time FROM properties WHERE id = ?').get(r.property_id) : null;
    return { ...r, customer, job: job || null, property: property || null };
  }
  const getRequest = (id) => {
    const r = q('SELECT * FROM portal_requests WHERE id = ?').get(Number(id));
    if (!r) throw new HttpError(404, 'Request not found');
    return r;
  };

  function requestSummary(r) {
    const h = hydrateRequest(r);
    if (r.kind === 'turnover') {
      return `Turnover at ${h.property ? h.property.name : 'a property'} on ${fmtDate(r.requested_at)}`
        + `${r.checkout_time ? `, guest checkout ${r.checkout_time}` : ''}${r.checkin_time ? `, next check-in ${r.checkin_time}` : ''}`;
    }
    const when = h.job ? fmtWhen(h.job.scheduled_at) : 'a cleaning';
    return r.kind === 'cancel' ? `Cancel the cleaning on ${when}` : `Move the cleaning on ${when} to ${fmtWhen(r.requested_at)}`;
  }

  async function createRequest(account, kind, body) {
    const customerId = account.customer_id;
    const note = str(body.note, 2000);
    let row;
    if (kind === 'reschedule' || kind === 'cancel') {
      const job = ownedJob(customerId, body.job_id);
      if (job.status !== 'scheduled' || job.scheduled_at < nowLocal()) throw new HttpError(400, 'Only upcoming cleanings can be changed. Call us for help.');
      if (q(`SELECT 1 FROM portal_requests WHERE job_id = ? AND status = 'pending'`).get(job.id)) {
        throw new HttpError(409, 'You already have a request waiting for this cleaning. We will get back to you soon.');
      }
      let requested = null;
      if (kind === 'reschedule') {
        requested = str(body.scheduled_at, 16);
        if (!requested || !DATETIME.test(requested)) throw new HttpError(400, 'Pick the new date and time');
        if (requested < nowLocal()) throw new HttpError(400, 'Pick a date and time in the future');
      }
      row = q(`INSERT INTO portal_requests (customer_id, kind, job_id, requested_at, note) VALUES (?, ?, ?, ?, ?)`)
        .run(customerId, kind, job.id, requested, note);
    } else if (kind === 'turnover') {
      const property = ownedProperty(customerId, body.property_id);
      const date = str(body.date, 10);
      if (!date || !DATE.test(date)) throw new HttpError(400, 'Pick the turnover date');
      if (date < nowLocal().slice(0, 10)) throw new HttpError(400, 'Pick a date that is today or later');
      const checkout = str(body.checkout_time, 5) || property.checkout_time;
      const checkin = str(body.checkin_time, 5) || property.checkin_time;
      for (const t of [checkout, checkin]) if (t && !TIME.test(t)) throw new HttpError(400, 'Times must look like 11:00');
      row = q(`INSERT INTO portal_requests (customer_id, kind, property_id, requested_at, checkout_time, checkin_time, note) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(customerId, kind, property.id, date, checkout, checkin, note);
    } else {
      throw new HttpError(400, 'Unknown request');
    }
    const request = getRequest(row.lastInsertRowid);
    const customer = svc.getCustomer(customerId);
    const label = { reschedule: 'Reschedule request', cancel: 'Cancellation request', turnover: 'Turnover request' }[kind];
    alertAdmin('portal_request', `📅 ${label} from ${customer.name}`,
      `${customer.name} (${[customer.phone, account.email].filter(Boolean).join(', ')}) asked from the ${account.is_host ? 'host' : 'client'} portal:\n\n`
      + `${requestSummary(request)}${note ? `\n\nNote: ${note}` : ''}\n\nApprove or decline it in the admin.`, '/requests')
      .catch((err) => console.error('[portal] request alert error', err));
    return hydrateRequest(request);
  }

  function listRequests({ status, customer_id, kind } = {}) {
    const where = [];
    const params = [];
    if (status && status !== 'all') { where.push('status = ?'); params.push(status); }
    if (customer_id) { where.push('customer_id = ?'); params.push(Number(customer_id)); }
    if (kind) { where.push('kind = ?'); params.push(kind); }
    return q(`SELECT * FROM portal_requests ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
              ORDER BY (status = 'pending') DESC, created_at DESC, id DESC LIMIT 500`).all(...params).map(hydrateRequest);
  }

  async function approveRequest(id, body = {}) {
    const r = getRequest(id);
    if (r.status !== 'pending') throw new HttpError(400, `This request was already ${r.status}`);
    const adminNote = str(body.admin_note, 2000);
    let job;
    if (r.kind === 'reschedule') {
      const scheduled = str(body.scheduled_at, 16) || r.requested_at;
      if (!DATETIME.test(scheduled || '')) throw new HttpError(400, 'Pick a date and time');
      const current = svc.getJob(r.job_id);
      job = await svc.updateJob(current.id, { ...current, scheduled_at: scheduled, status: 'scheduled', employee_ids: current.employees.map((e) => e.id), notify_employees: false });
      if (job.employees.length) await svc.notifyAssigned(job, job.employees.map((e) => e.id), { changed: true });
    } else if (r.kind === 'cancel') {
      const current = svc.getJob(r.job_id);
      job = await svc.updateJob(current.id, { ...current, status: 'cancelled', employee_ids: current.employees.map((e) => e.id), notify_employees: false });
    } else {
      const property = getProperty(r.property_id);
      const scheduled = str(body.scheduled_at, 16) || `${r.requested_at}T${r.checkout_time || property.checkout_time || '11:00'}`;
      job = await svc.createJob({
        customer_id: r.customer_id, property_id: property.id, scheduled_at: scheduled,
        duration_hours: num(body.duration_hours) || 3, address: property.address, service_type: TURNOVER_SERVICE,
        price: num(body.price), employee_ids: body.employee_ids || [],
        notes: [r.checkin_time && `Next guest checks in at ${r.checkin_time}.`, property.access_notes && `Access: ${property.access_notes}`, r.note && `Host note: ${r.note}`]
          .filter(Boolean).join(' ') || null,
      });
    }
    q(`UPDATE portal_requests SET status = 'approved', admin_note = ?, job_id = COALESCE(job_id, ?), resolved_at = datetime('now'),
       updated_at = datetime('now') WHERE id = ?`).run(adminNote, job.id, r.id);
    const done = getRequest(r.id);
    const what = r.kind === 'cancel' ? `Your cleaning on ${fmtWhen(job.scheduled_at)} is cancelled.`
      : r.kind === 'reschedule' ? `Your cleaning is now booked for ${fmtWhen(job.scheduled_at)}.`
        : `Your turnover is booked for ${fmtWhen(job.scheduled_at)}${job.property ? ` at ${job.property.name}` : ''}.`;
    const email = await emailClient(r.customer_id, 'request_approved', `Request approved — ${config.businessName}`, `Good news! ${what}${adminNote ? `\n\n${adminNote}` : ''}`);
    return { request: hydrateRequest(done), job, email };
  }

  async function declineRequest(id, body = {}) {
    const r = getRequest(id);
    if (r.status !== 'pending') throw new HttpError(400, `This request was already ${r.status}`);
    const adminNote = str(body.admin_note, 2000);
    q(`UPDATE portal_requests SET status = 'declined', admin_note = ?, resolved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(adminNote, r.id);
    const email = await emailClient(r.customer_id, 'request_declined', `About your request — ${config.businessName}`,
      `We couldn't do this one: ${requestSummary(r)}.${adminNote ? `\n\n${adminNote}` : ''}\n\nCall or text us and we'll find something that works.`);
    return { request: hydrateRequest(getRequest(r.id)), email };
  }

  // ---------- turnover reports & photos ----------
  const parsePhotos = (report) => { try { return JSON.parse(report.photos || '[]'); } catch { return []; } };
  function getReport(jobId) {
    const r = q('SELECT * FROM job_reports WHERE job_id = ?').get(Number(jobId));
    return r ? { ...r, photos: parsePhotos(r) } : null;
  }
  function ensureReport(jobId) {
    svc.getJob(jobId);
    q('INSERT OR IGNORE INTO job_reports (job_id) VALUES (?)').run(Number(jobId));
    return getReport(jobId);
  }
  function saveReport(jobId, body) {
    ensureReport(jobId);
    q(`UPDATE job_reports SET notes = ?, damage_notes = ?, inventory_notes = ?, updated_at = datetime('now') WHERE job_id = ?`)
      .run(str(body.notes, 5000), str(body.damage_notes, 5000), str(body.inventory_notes, 5000), Number(jobId));
    return getReport(jobId);
  }

  const jobDir = (jobId) => path.join(config.uploadsDir, 'jobs', String(Number(jobId)));

  function addPhoto(jobId, { name, data }) {
    const report = ensureReport(jobId);
    if (report.photos.length >= MAX_PHOTOS) throw new HttpError(400, `A report can have up to ${MAX_PHOTOS} photos`);
    if (typeof data !== 'string' || !data) throw new HttpError(400, 'No photo received');
    const base64 = data.replace(/^data:[\w/+.-]+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    if (!buf.length) throw new HttpError(400, 'No photo received');
    if (buf.length > config.uploadMaxMb * 1024 * 1024) throw new HttpError(413, `Photos must be ${config.uploadMaxMb} MB or smaller`);
    // Check the file itself, not the name or the browser's claim.
    const kind = IMAGE_TYPES.find((t) => t.test(buf));
    if (!kind) throw new HttpError(415, 'Only JPEG, PNG, WebP or GIF photos can be uploaded');
    const file = `${crypto.randomBytes(12).toString('hex')}.${kind.ext}`;
    fs.mkdirSync(jobDir(jobId), { recursive: true });
    fs.writeFileSync(path.join(jobDir(jobId), file), buf, { flag: 'wx' });
    const photos = [...report.photos, { file, name: str(name, 120) || file, type: kind.type, size: buf.length, uploaded_at: new Date().toISOString() }];
    q(`UPDATE job_reports SET photos = ?, updated_at = datetime('now') WHERE job_id = ?`).run(JSON.stringify(photos), Number(jobId));
    return getReport(jobId);
  }

  function deletePhoto(jobId, file) {
    const report = getReport(jobId);
    if (!report || !report.photos.some((p) => p.file === file)) throw new HttpError(404, 'Photo not found');
    q(`UPDATE job_reports SET photos = ?, updated_at = datetime('now') WHERE job_id = ?`)
      .run(JSON.stringify(report.photos.filter((p) => p.file !== file)), Number(jobId));
    if (PHOTO_FILE.test(file)) fs.rmSync(path.join(jobDir(jobId), file), { force: true });
    return getReport(jobId);
  }

  // Sends a photo only if it is listed on that job's report (and the caller already checked who owns the job).
  function sendPhoto(res, jobId, file) {
    const report = getReport(jobId);
    const photo = report && PHOTO_FILE.test(file) && report.photos.find((p) => p.file === file);
    const full = photo && path.join(jobDir(jobId), file);
    if (!photo || !fs.existsSync(full)) throw new HttpError(404, 'Photo not found');
    res.setHeader('Content-Type', photo.type);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    fs.createReadStream(full).pipe(res);
  }

  function clientReport(customerId, jobId) {
    const job = ownedJob(customerId, jobId);
    const report = getReport(job.id);
    return { job: clientJob(job), report: report && { notes: report.notes, damage_notes: report.damage_notes, inventory_notes: report.inventory_notes, photos: report.photos.map((p) => ({ file: p.file, name: p.name })), updated_at: report.updated_at } };
  }

  // ---------- profile ----------
  function profile(account) {
    const c = svc.getCustomer(account.customer_id);
    return {
      name: c.name, email: account.email, phone: c.phone, address: c.address, city: c.city, zip: c.zip,
      marketing_opt_in: c.marketing_opt_in, email_updates: account.email_updates, is_host: account.is_host,
    };
  }
  function updateProfile(account, body) {
    const name = str(body.name, 120);
    if (!name) throw new HttpError(400, 'Please enter your name');
    const phone = body.phone ? normalizePhone(body.phone) : null;
    if (body.phone && !phone) throw new HttpError(400, 'Phone number looks invalid');
    q(`UPDATE customers SET name = ?, phone = ?, address = ?, city = ?, zip = ?, marketing_opt_in = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(name, phone, str(body.address, 250), str(body.city, 80), str(body.zip, 12), body.marketing_opt_in ? 1 : 0, account.customer_id);
    accounts.setPrefs(account, body);
    return profile(accounts.getAccount(account.id));
  }

  // ---------- routers ----------
  function createPortalRouter({ rateLimit, h }) {
    const r = express.Router();
    const client = accounts.requirePortal();
    const host = accounts.requirePortal({ host: true });
    const cid = (req) => req.account.customer_id;

    // auth
    r.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }), h(accounts.login));
    r.post('/logout', accounts.logout);
    r.post('/forgot', rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }), h(accounts.forgot));
    r.post('/register', rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }), h(accounts.register));
    r.get('/password-link', rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }), accounts.checkToken);
    r.post('/set-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }), h(accounts.setPassword));
    r.get('/session', (req, res) => {
      const a = accounts.sessionAccount(req);
      if (!a) return res.json({ loggedIn: false });
      const c = q('SELECT name FROM customers WHERE id = ?').get(a.customer_id);
      res.json({ loggedIn: true, name: c ? c.name : '', email: a.email, is_host: a.is_host });
    });

    // dashboard
    r.get('/dashboard', client, (req, res) => {
      const jobs = customerJobs(cid(req));
      const open = q(`SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM invoices WHERE customer_id = ? AND status = 'sent'`).get(cid(req));
      const turnovers = req.account.is_host ? customerJobs(cid(req), { propertyOnly: true }) : null;
      res.json({
        name: profile(req.account).name,
        is_host: req.account.is_host,
        next_job: jobs.upcoming[0] || null,
        upcoming_count: jobs.upcoming.length,
        open_invoices: { count: open.n, total: Math.round(open.total * 100) / 100 },
        pending_requests: q(`SELECT COUNT(*) AS n FROM portal_requests WHERE customer_id = ? AND status = 'pending'`).get(cid(req)).n,
        ...(turnovers ? {
          next_turnover: turnovers.upcoming[0] || null,
          upcoming_turnovers: turnovers.upcoming.length,
          properties: q('SELECT COUNT(*) AS n FROM properties WHERE customer_id = ?').get(cid(req)).n,
        } : {}),
      });
    });

    // bookings
    r.get('/bookings', client, (req, res) => res.json({
      ...customerJobs(cid(req)),
      requests: listRequests({ customer_id: cid(req) }).filter((x) => x.kind !== 'turnover').map(clientRequest),
    }));
    r.post('/bookings/:id/reschedule', client, h(async (req, res) => res.status(201).json(clientRequest(await createRequest(req.account, 'reschedule', { ...req.body, job_id: req.params.id })))));
    r.post('/bookings/:id/cancel', client, h(async (req, res) => res.status(201).json(clientRequest(await createRequest(req.account, 'cancel', { ...req.body, job_id: req.params.id })))));
    // A new cleaning request becomes a lead, exactly like the website's quote form.
    r.post('/bookings/new', client, h(async (req, res) => {
      const c = svc.getCustomer(cid(req));
      const b = req.body || {};
      const lead = svc.createLead({
        name: c.name, email: req.account.email, phone: c.phone,
        address: str(b.address, 250) || [c.address, c.city].filter(Boolean).join(', '), zip: str(b.zip, 12) || c.zip,
        service_type: b.service_type, frequency: b.frequency, bedrooms: b.bedrooms, bathrooms: b.bathrooms,
        preferred_date: b.preferred_date, message: b.message, marketing_opt_in: c.marketing_opt_in,
      }, 'portal');
      notifier.newLead(lead).catch((err) => console.error('[portal] lead alert error', err));
      res.status(201).json({ ok: true, id: lead.id });
    }));

    // invoices
    r.get('/invoices', client, (req, res) => res.json(clientInvoices(cid(req)).map(clientInvoiceView)));
    r.get('/invoices/:id', client, (req, res) => res.json(clientInvoiceView(clientInvoice(cid(req), req.params.id))));

    // profile
    r.get('/profile', client, (req, res) => res.json(profile(req.account)));
    r.put('/profile', client, (req, res) => res.json(updateProfile(req.account, req.body || {})));
    r.post('/password', client, h(async (req, res) => {
      const account = await accounts.changePassword(req.account, req.body || {});
      accounts.issueSession(res, account); // stay logged in here; other devices are logged out
      res.json({ ok: true });
    }));

    // host: properties
    r.get('/properties', host, (req, res) => res.json(listProperties({ customer_id: cid(req) }).map(clientProperty)));
    r.post('/properties', host, (req, res) => res.status(201).json(clientProperty(createProperty(cid(req), req.body || {}))));
    r.get('/properties/:id', host, (req, res) => res.json(clientProperty(ownedProperty(cid(req), req.params.id))));
    r.put('/properties/:id', host, (req, res) => {
      const p = ownedProperty(cid(req), req.params.id);
      res.json(clientProperty(updateProperty(p.id, req.body || {})));
    });

    // host: turnovers
    r.get('/turnovers', host, (req, res) => res.json({
      ...customerJobs(cid(req), { propertyOnly: true }),
      requests: listRequests({ customer_id: cid(req), kind: 'turnover' }).map(clientRequest),
    }));
    r.post('/turnovers', host, h(async (req, res) => res.status(201).json(clientRequest(await createRequest(req.account, 'turnover', req.body || {})))));
    r.get('/turnovers/:id', host, (req, res) => res.json(clientReport(cid(req), req.params.id)));
    r.get('/photos/:jobId/:file', host, h(async (req, res) => {
      ownedJob(cid(req), req.params.jobId);
      sendPhoto(res, req.params.jobId, req.params.file);
    }));

    return r;
  }

  // What the client sees of a request (no internal ids beyond their own).
  function clientRequest(x) {
    return {
      id: x.id, kind: x.kind, status: x.status, requested_at: x.requested_at, checkout_time: x.checkout_time, checkin_time: x.checkin_time,
      note: x.note, admin_note: x.admin_note, created_at: x.created_at, resolved_at: x.resolved_at,
      job: x.job ? { id: x.job.id, scheduled_at: x.job.scheduled_at, service_type: x.job.service_type } : null,
      property: x.property ? { id: x.property.id, name: x.property.name } : null,
    };
  }
  function clientInvoiceView(inv) {
    return {
      id: inv.id, number: inv.number, amount: inv.amount, status: inv.status, due_date: inv.due_date,
      pay_url: inv.status === 'sent' ? inv.pay_url : null, notes: inv.notes, created_at: inv.created_at, sent_at: inv.sent_at,
      paid_at: inv.paid_at, overdue: inv.overdue, customer: inv.customer,
      job: inv.job ? { scheduled_at: inv.job.scheduled_at, service_type: inv.job.service_type, address: inv.job.address } : null,
    };
  }
  function clientProperty(p) {
    const { customer_id, owner_name, ...rest } = p; // eslint-disable-line no-unused-vars
    return rest;
  }

  // Mounted inside the admin router (already behind the admin login).
  function mountAdmin(admin, { h }) {
    const id = (req) => Number(req.params.id);

    // portal access on the client page
    admin.put('/customers/:id/portal', h(async (req, res) => {
      const customer = svc.getCustomer(id(req));
      const b = req.body || {};
      const existing = accounts.accountForCustomer(customer.id);
      if (!existing && b.enabled === false) return res.json({ account: null });
      const account = accounts.ensureAccount(customer, {
        enabled: b.enabled === undefined ? undefined : Boolean(b.enabled),
        is_host: b.is_host === undefined ? undefined : Boolean(b.is_host),
      });
      let email = null;
      if (b.send_link && account.enabled) email = await accounts.sendPasswordLink(account, 'set');
      res.json({ account: accounts.publicAccount(account), email });
    }));
    admin.post('/customers/:id/portal/invite', h(async (req, res) => {
      const customer = svc.getCustomer(id(req));
      const account = accounts.accountForCustomer(customer.id) || accounts.ensureAccount(customer, { enabled: true });
      if (!account.enabled) throw new HttpError(400, 'Portal access is turned off for this client. Turn it on first.');
      const email = await accounts.sendPasswordLink(account, 'set');
      if (!email.ok) throw new HttpError(502, `Link not sent: ${email.error}`);
      res.json({ ok: true, account: accounts.publicAccount(account) });
    }));

    // invoices
    admin.get('/invoices', (req, res) => res.json(listInvoices(req.query)));
    admin.post('/invoices', (req, res) => res.status(201).json(createInvoice(req.body || {})));
    admin.get('/invoices/:id', (req, res) => res.json(hydrateInvoice(getInvoice(id(req)))));
    admin.put('/invoices/:id', (req, res) => res.json(updateInvoice(id(req), req.body || {})));
    admin.delete('/invoices/:id', (req, res) => {
      getInvoice(id(req));
      q('DELETE FROM invoices WHERE id = ?').run(id(req));
      res.json({ ok: true });
    });
    admin.post('/invoices/:id/send', h(async (req, res) => res.json(await sendInvoice(id(req)))));

    // properties
    admin.get('/properties', (req, res) => res.json(listProperties(req.query)));
    admin.post('/properties', (req, res) => res.status(201).json(createProperty(num(req.body && req.body.customer_id), req.body || {})));
    admin.get('/properties/:id', (req, res) => res.json({ ...getProperty(id(req)), jobs: svc.listJobs({ property_id: id(req) }) }));
    admin.put('/properties/:id', (req, res) => { getProperty(id(req)); res.json(updateProperty(id(req), req.body || {})); });
    admin.delete('/properties/:id', (req, res) => {
      getProperty(id(req));
      q('DELETE FROM properties WHERE id = ?').run(id(req));
      res.json({ ok: true });
    });

    // requests inbox
    admin.get('/requests', (req, res) => res.json(listRequests({ status: req.query.status || 'pending', customer_id: req.query.customer_id })));
    admin.post('/requests/:id/approve', h(async (req, res) => res.json(await approveRequest(id(req), req.body))));
    admin.post('/requests/:id/decline', h(async (req, res) => res.json(await declineRequest(id(req), req.body))));

    // turnover / job reports
    admin.get('/jobs/:id/report', (req, res) => { svc.getJob(id(req)); res.json(getReport(id(req)) || { job_id: id(req), notes: null, damage_notes: null, inventory_notes: null, photos: [] }); });
    admin.put('/jobs/:id/report', (req, res) => res.json(saveReport(id(req), req.body || {})));
    admin.post('/jobs/:id/report/photos', (req, res) => res.status(201).json(addPhoto(id(req), req.body || {})));
    admin.delete('/jobs/:id/report/photos/:file', (req, res) => res.json(deletePhoto(id(req), req.params.file)));
    admin.get('/photos/:jobId/:file', h(async (req, res) => sendPhoto(res, req.params.jobId, req.params.file)));
  }

  return {
    INVOICE_STATUSES, REQUEST_KINDS,
    createPortalRouter, mountAdmin,
    listInvoices, createInvoice, updateInvoice, sendInvoice, listProperties, createProperty, listRequests,
    approveRequest, declineRequest, getReport, saveReport, addPhoto,
  };
}

module.exports = { createPortal };

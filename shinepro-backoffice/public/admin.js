/* Shine Pro Cleaning — Back Office (no build step, plain JavaScript) */
(() => {
  const app = document.getElementById('app');
  let META = null;

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`/api/admin${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    if (res.status === 401 && !path.startsWith('/login')) { showLogin(); throw new Error('Please log in'); }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || `Request failed (${res.status})`), { data });
    return data;
  }

  function toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = `toast${isError ? ' error' : ''}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), isError ? 6000 : 3000);
  }

  const fmtPhone = (p) => { const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p || ''); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (p || ''); };
  const utcDate = (s) => (s ? new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`) : null); // DB timestamps are UTC
  const fmtAgo = (s) => {
    const d = utcDate(s); if (!d) return '';
    const mins = Math.round((Date.now() - d) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  };
  const fmtWhen = (local) => new Date(local).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fmtTime = (local) => new Date(local).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const money = (n) => (n == null || n === '' ? '' : `$${Number(n).toLocaleString()}`);
  const status = (s) => `<span class="status st-${esc(s)}">${esc(s)}</span>`;
  const serviceLabel = (k) => (META && META.pricing.services[k] ? META.pricing.services[k].label : k || '');
  const freqLabel = (k) => (META && META.pricing.frequency[k] ? META.pricing.frequency[k].label : k || '');
  const localISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  // Google Voice has no API: we open the conversation for that number and copy the message to paste.
  const gvLink = (phone) => `https://voice.google.com/u/0/messages?itemId=t.${encodeURIComponent(phone)}`;
  function openGoogleVoice(phone, text) {
    if (text && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    window.open(gvLink(phone), '_blank', 'noopener');
  }
  const contactLinks = (p) => `
    <div class="row">
      ${p.phone ? `<a class="btn sm secondary" href="tel:${esc(p.phone)}">📞 Call</a><a class="btn sm secondary" href="${gvLink(p.phone)}" target="_blank" rel="noopener">💬 Text (Google Voice)</a>` : ''}
      ${p.email ? `<a class="btn sm secondary" href="mailto:${esc(p.email)}">✉️ Email</a>` : ''}
    </div>`;

  function formData(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') {
        if (el.dataset.multi) { (out[el.name] ||= []); if (el.checked) out[el.name].push(Number(el.value)); }
        else out[el.name] = el.checked;
      } else out[el.name] = el.value;
    }
    return out;
  }

  function modal(title, innerHtml, onSubmit, { submitLabel = 'Save', danger } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<form class="modal" novalidate>
      <div class="row between"><h2>${esc(title)}</h2><button type="button" class="btn sm secondary" data-close>✕</button></div>
      ${innerHtml}
      <div class="actions">
        ${danger ? `<button type="button" class="btn danger" data-danger style="margin-right:auto">${esc(danger.label)}</button>` : ''}
        <button type="button" class="btn secondary" data-close>Cancel</button>
        <button type="submit" class="btn">${esc(submitLabel)}</button>
      </div></form>`;
    const close = () => wrap.remove();
    $$('[data-close]', wrap).forEach((b) => (b.onclick = close));
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    const form = $('form', wrap);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try { await onSubmit(formData(form), form); close(); } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
    };
    if (danger) $('[data-danger]', wrap).onclick = async () => {
      if (!confirm(danger.confirm)) return;
      try { await danger.action(); close(); } catch (err) { toast(err.message, true); }
    };
    document.body.appendChild(wrap);
    const first = $('input:not([type=hidden]):not([type=checkbox]), textarea, select', form);
    if (first) first.focus();
    return form;
  }

  const input = (name, label, value = '', { type = 'text', full = false, attrs = '' } = {}) =>
    `<div class="field ${full ? 'full' : ''}"><label for="f-${name}">${esc(label)}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${attrs}></div>`;
  const textarea = (name, label, value = '') =>
    `<div class="field full"><label for="f-${name}">${esc(label)}</label><textarea id="f-${name}" name="${name}">${esc(value)}</textarea></div>`;
  const select = (name, label, options, value, { full = false } = {}) =>
    `<div class="field ${full ? 'full' : ''}"><label for="f-${name}">${esc(label)}</label><select id="f-${name}" name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  const checkbox = (name, label, checked) =>
    `<div class="field full"><label class="check"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> ${esc(label)}</label></div>`;

  // ---------- auth ----------
  function showLogin() {
    $('#topbar').classList.add('hidden');
    app.innerHTML = `<div class="login-wrap"><form class="card login" id="login-form">
      <div class="row" style="margin-bottom:16px"><span class="brand-mark">S</span><strong>Shine Pro Cleaning · Admin</strong></div>
      ${input('password', 'Admin password', '', { type: 'password', attrs: 'autocomplete="current-password" required' })}
      <button class="btn block" type="submit">Log in</button></form></div>`;
    $('#login-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/login', { method: 'POST', body: { password: e.target.password.value } });
        start();
      } catch (err) { toast(err.message, true); }
    };
    $('#f-password').focus();
  }

  $('#logout').onclick = async (e) => { e.preventDefault(); await api('/logout', { method: 'POST', body: {} }).catch(() => {}); showLogin(); };

  // ---------- router ----------
  const routes = [
    [/^\/?$/, dashboard],
    [/^\/leads$/, leadsPage],
    [/^\/leads\/(\d+)$/, leadDetail],
    [/^\/customers$/, customersPage],
    [/^\/customers\/(\d+)$/, customerDetail],
    [/^\/employees$/, employeesPage],
    [/^\/employees\/(\d+)$/, employeeDetail],
    [/^\/jobs$/, jobsPage],
    [/^\/calendar$/, calendarPage],
    [/^\/alerts$/, alertsPage],
    [/^\/invoices$/, invoicesPage],
    [/^\/requests$/, requestsPage],
  ];

  async function render() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = hash.split('?');
    const params = new URLSearchParams(qs || '');
    const section = path.split('/')[1] || '';
    $$('#nav a[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === section));
    for (const [re, fn] of routes) {
      const m = re.exec(path);
      if (m) {
        try { await fn(...m.slice(1), params); } catch (err) { if (err.message !== 'Please log in') app.innerHTML = `<div class="banner danger">${esc(err.message)}</div>`; }
        refreshBadge();
        return;
      }
    }
    app.innerHTML = '<div class="empty">Page not found. <a href="#/">Go home</a></div>';
  }

  async function refreshBadge() {
    try {
      const s = await api('/stats');
      const b = $('#new-leads-badge');
      b.textContent = s.new_leads;
      b.classList.toggle('hidden', !s.new_leads);
      const rb = $('#requests-badge');
      rb.textContent = s.pending_requests;
      rb.classList.toggle('hidden', !s.pending_requests);
      document.title = `${s.new_leads ? `(${s.new_leads}) ` : ''}Back Office · Shine Pro Cleaning`;
    } catch { /* ignore */ }
  }

  // ---------- dashboard ----------
  async function dashboard() {
    const [s, leads, jobs] = await Promise.all([
      api('/stats'),
      api('/leads?status=new'),
      api(`/jobs?from=${localISO(new Date()).slice(0, 10)}&status=scheduled`),
    ]);
    const a = s.alerts;
    const alertProblems = [];
    if (!a.email_configured) alertProblems.push('email sending (SMTP) is not set up');
    if (!a.alert_emails) alertProblems.push('no ALERT_EMAILS address is set');
    app.innerHTML = `
      <h1>Back Office</h1>
      ${alertProblems.length ? `<div class="banner warn"><strong>Lead alerts need attention:</strong> ${esc(alertProblems.join('; '))}. New leads are still saved here. <a href="#/alerts">See alert settings →</a></div>` : ''}
      ${s.callbacks ? `<div class="banner danger"><strong>📞 ${s.callbacks} customer(s) asked you to call them back.</strong> <a href="#/leads?status=new">Call them now →</a></div>` : ''}
      ${s.pending_requests ? `<div class="banner warn"><strong>📅 ${s.pending_requests} client request(s) waiting</strong> (reschedule, cancel or turnover). <a href="#/requests">Answer them →</a></div>` : ''}
      ${s.failed_alerts ? `<div class="banner danger"><strong>${s.failed_alerts} lead alert(s) failed or were skipped this week.</strong> Check the <a href="#/leads">Leads</a> list so nobody is missed. <a href="#/alerts">Details →</a></div>` : ''}
      <div class="tiles">
        ${tile('#/leads', '📈', 'i-gold', 'Leads', `${s.new_leads} new · ${s.open_leads} open`)}
        ${tile('#/jobs', '📋', 'i-blue', 'Bookings', `${s.upcoming_jobs} upcoming`)}
        ${tile('#/calendar', '🗓', 'i-teal', 'Calendar', 'Week view')}
        ${tile('#/customers', '👤', 'i-green', 'Clients', 'Search & manage')}
        ${tile('#/employees', '🧹', 'i-cyan', 'Employees', `${s.active_employees} active`)}
        ${tile('#/requests', '📨', 'i-red', 'Requests', `${s.pending_requests} waiting`)}
        ${tile('#/invoices', '🧾', 'i-gold', 'Invoices', `${s.open_invoices} unpaid`)}
        ${tile('#/alerts', '🔔', 'i-purple', 'Alerts', 'Email & text log')}
      </div>
      <div class="stats">
        ${stat(s.customers, 'Total Customers')}
        ${stat(s.leads_this_week, 'Leads (7 days)')}
        ${stat(s.upcoming_jobs, 'Upcoming Jobs')}
        ${stat(s.unassigned_jobs, 'Jobs Needing a Cleaner')}
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="row between"><h2>🔥 New leads — contact these first</h2><a href="#/leads">All leads</a></div>
          <div class="list">${leads.length ? leads.slice(0, 8).map(leadItem).join('') : '<div class="empty">No new leads right now 🎉</div>'}</div>
        </div>
        <div class="card">
          <div class="row between"><h2>Upcoming jobs</h2><a href="#/calendar">Calendar</a></div>
          <div class="list">${jobs.length ? jobs.slice(0, 8).map(jobItem).join('') : '<div class="empty">No upcoming jobs</div>'}</div>
        </div>
      </div>`;
    bindJobItems();
  }
  const tile = (href, icon, cls, t, d) => `<a class="tile" href="${href}"><span class="icon ${cls}">${icon}</span><span><div class="t">${esc(t)}</div><div class="d">${esc(d)}</div></span><span class="chev">›</span></a>`;
  const stat = (n, l) => `<div class="stat"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></div>`;

  // ---------- leads ----------
  const leadItem = (l) => `<a class="item" href="#/leads/${l.id}">
      <div class="main"><div class="title">${l.callback_requested && l.status === 'new' ? '<span class="status st-failed">📞 Call back</span> ' : ''}${l.has_chat ? '💻 ' : ''}${esc(l.name)} ${l.reply_count ? `<span class="badge" title="Replies">${l.reply_count} 💬</span>` : ''}</div>
      <div class="sub">${esc([fmtPhone(l.phone), l.email, serviceLabel(l.service_type)].filter(Boolean).join(' · '))}</div></div>
      <div style="text-align:right">${status(l.status)}<div class="sub small">${money(l.estimated_price)} ${esc(fmtAgo(l.created_at))}</div></div></a>`;

  async function leadsPage(params) {
    const st = params.get('status') || 'all';
    const search = params.get('q') || '';
    const leads = await api(`/leads?status=${encodeURIComponent(st)}&q=${encodeURIComponent(search)}`);
    app.innerHTML = `
      <div class="row between"><h1>Leads</h1><button class="btn" id="add-lead">+ Add lead</button></div>
      <div class="tabs">${['all', ...META.leadStatuses].map((s) => `<button data-st="${s}" class="${s === st ? 'active' : ''}">${s}</button>`).join('')}</div>
      <form class="searchbar" id="search"><input name="q" placeholder="Search name, phone, email, address" value="${esc(search)}"><button class="btn secondary">Search</button></form>
      <div class="list">${leads.length ? leads.map(leadItem).join('') : '<div class="empty">No leads found</div>'}</div>`;
    const go = (s, q) => { location.hash = `#/leads?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ''}`; };
    $$('.tabs button').forEach((b) => (b.onclick = () => go(b.dataset.st, search)));
    $('#search').onsubmit = (e) => { e.preventDefault(); go(st, e.target.q.value); };
    $('#add-lead').onclick = () => leadForm();
  }

  function leadForm(lead) {
    const services = [['', '— Choose —'], ...Object.entries(META.pricing.services).map(([k, v]) => [k, v.label])];
    const freqs = [['', '— Choose —'], ...Object.entries(META.pricing.frequency).map(([k, v]) => [k, v.label])];
    const l = lead || {};
    modal(lead ? 'Edit lead' : 'Add lead (phone call, walk-in, referral…)', `<div class="form-grid">
      ${input('name', 'Name *', l.name)}${input('phone', 'Phone', fmtPhone(l.phone), { type: 'tel' })}
      ${input('email', 'Email', l.email, { type: 'email' })}${input('zip', 'ZIP', l.zip)}
      ${input('address', 'Address', l.address, { full: true })}
      ${lead ? '' : select('service_type', 'Service', services, l.service_type) + select('frequency', 'Frequency', freqs, l.frequency)
        + input('bedrooms', 'Bedrooms', l.bedrooms, { type: 'number' }) + input('bathrooms', 'Bathrooms', l.bathrooms, { type: 'number', attrs: 'step="0.5"' })
        + input('sqft', 'Square feet', l.sqft, { type: 'number' })}
      ${input('preferred_date', 'Preferred date', l.preferred_date)}
      ${lead ? input('estimated_price', 'Quoted price ($)', l.estimated_price, { type: 'number' }) : ''}
      ${textarea('message', 'Notes / details', l.message)}
      ${lead ? '' : checkbox('marketing_opt_in', 'Customer agreed to receive offers & updates', l.marketing_opt_in)}
      </div>`, async (data) => {
      if (lead) { await api(`/leads/${lead.id}`, { method: 'PATCH', body: data }); toast('Lead updated'); render(); }
      else { const created = await api('/leads', { method: 'POST', body: data }); toast('Lead added'); location.hash = `#/leads/${created.id}`; }
    }, lead ? { danger: { label: 'Delete lead', confirm: 'Delete this lead and its messages?', action: async () => { await api(`/leads/${lead.id}`, { method: 'DELETE' }); location.hash = '#/leads'; } } } : {});
  }

  async function leadDetail(id) {
    const l = await api(`/leads/${id}`);
    app.innerHTML = `
      <p><a href="#/leads">← All leads</a></p>
      <div class="row between"><h1>${esc(l.name)}</h1>
        <div class="row">
          <select id="lead-status" style="width:auto">${META.leadStatuses.map((s) => `<option ${s === l.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <button class="btn secondary" id="edit-lead">Edit</button>
          <button class="btn" id="book-lead">📅 Book job</button>
        </div>
      </div>
      <div class="grid-2">
        <div>
          <div class="card">
            <h2>Quote request</h2>
            <dl class="kv">
              <dt>Status</dt><dd>${status(l.status)}</dd>
              <dt>Received</dt><dd>${esc(utcDate(l.created_at).toLocaleString())} <span class="muted small">(${esc(l.source)})</span></dd>
              <dt>Phone</dt><dd>${esc(fmtPhone(l.phone)) || '—'}</dd>
              <dt>Email</dt><dd>${esc(l.email) || '—'}</dd>
              <dt>Address</dt><dd>${esc([l.address, l.zip].filter(Boolean).join(' ')) || '—'}</dd>
              <dt>Service</dt><dd>${esc(serviceLabel(l.service_type)) || '—'}</dd>
              <dt>Home</dt><dd>${l.bedrooms ?? '?'} bed · ${l.bathrooms ?? '?'} bath${l.sqft ? ` · ${l.sqft} sqft` : ''}</dd>
              <dt>Frequency</dt><dd>${esc(freqLabel(l.frequency)) || '—'}</dd>
              <dt>Preferred date</dt><dd>${esc(l.preferred_date) || '—'}</dd>
              <dt>Estimate</dt><dd><strong>${money(l.estimated_price) || '—'}</strong></dd>
              <dt>Marketing OK</dt><dd>${l.marketing_opt_in ? '✅ Yes' : 'No'}</dd>
              ${l.callback_requested ? `<dt>Call back</dt><dd><strong style="color:var(--danger)">📞 Requested</strong></dd>` : ''}
              <dt>Admin alerted</dt><dd>${l.admin_notified ? '✅ Yes' : '⚠️ No — alert failed or not configured'}</dd>
              ${l.message ? `<dt>Message</dt><dd style="white-space:pre-wrap">${esc(l.message)}</dd>` : ''}
            </dl>
            <div style="margin-top:14px">${contactLinks(l)}</div>
          </div>
          ${l.customer ? `<div class="card"><h3>Client record</h3><a class="item" href="#/customers/${l.customer.id}"><div class="main"><div class="title">${esc(l.customer.name)}</div><div class="sub">${esc([fmtPhone(l.customer.phone), l.customer.email].filter(Boolean).join(' · '))}</div></div><span>›</span></a></div>` : ''}
          ${l.jobs.length ? `<div class="card"><h3>Jobs</h3><div class="list">${l.jobs.map(jobItem).join('')}</div></div>` : ''}
        </div>
        ${conversationCard(l.messages, l)}
      </div>`;
    $('#lead-status').onchange = async (e) => {
      try { await api(`/leads/${l.id}`, { method: 'PATCH', body: { status: e.target.value } }); toast('Status updated'); render(); } catch (err) { toast(err.message, true); }
    };
    $('#edit-lead').onclick = () => leadForm(l);
    $('#book-lead').onclick = () => jobForm({
      customer_id: l.customer_id, lead_id: l.id, address: [l.address, l.zip].filter(Boolean).join(' '),
      service_type: serviceLabel(l.service_type), price: l.estimated_price,
    });
    bindConversation(`/leads/${l.id}/messages`);
    bindJobItems();
  }

  // ---------- conversation ----------
  function conversationCard(messages, contact) {
    const channels = [];
    if (contact.has_chat) channels.push(['chat', '💻 Reply in website chat']);
    if (contact.phone && META.smsConfigured) channels.push(['sms', '💬 Text message']);
    if (contact.phone && !META.smsConfigured) channels.push(['gvoice', '💬 Text via Google Voice'], ['sms_in', "📥 Log customer's text reply"]);
    if (contact.email) channels.push(['email', '✉️ Email']);
    channels.push(['note', '📝 Private note']);
    const firstName = (contact.name || '').split(' ')[0];
    const templates = [
      ['', 'Quick replies…'],
      [`Hi ${firstName}, this is Shine Pro Cleaning — thanks for your quote request! ${contact.estimated_price ? `Your estimate is $${contact.estimated_price}. ` : ''}When would be a good day for your cleaning?`, 'Thanks + ask for date'],
      [`Hi ${firstName}, just following up on your cleaning quote. We have openings this week — would you like to book?`, 'Follow-up'],
      [`Hi ${firstName}, you're all set! We'll see you on the scheduled date. Reply here with any questions.`, 'Booking confirmed'],
    ];
    return `<div class="card">
      <h2>Conversation</h2>
      <div class="thread" id="thread">${messages.length ? messages.map(msgHtml).join('') : '<div class="empty small">No messages yet. Send your first reply below — the customer receives it as a text or email.</div>'}</div>
      <form id="reply" style="margin-top:14px" data-phone="${esc(contact.phone || '')}">
        <div class="row" style="margin-bottom:8px">
          <select name="channel" style="flex:1">${channels.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
          <select id="tpl" style="flex:1">${templates.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>
        </div>
        <input name="subject" placeholder="Email subject" class="hidden" style="margin-bottom:8px">
        <textarea name="body" placeholder="Type your reply…" required></textarea>
        <div class="row between" style="margin-top:8px"><span class="muted small" id="reply-hint"></span><button class="btn">Send</button></div>
      </form>
    </div>`;
  }

  function msgHtml(m) {
    const cls = m.direction === 'note' ? 'note' : m.direction === 'in' ? 'in' : 'out';
    const failed = m.status === 'failed' || m.status === 'skipped';
    const label = m.direction === 'note' ? 'Note'
      : m.channel === 'chat' ? (m.direction === 'in' ? 'Website chat · customer' : m.status === 'ai' ? 'Website chat · AI assistant' : m.status === 'auto' ? 'Website chat · automatic' : 'Website chat · you')
      : `${m.channel === 'sms' ? 'Text' : 'Email'}${m.direction === 'in' ? ' from customer' : ''}${m.status === 'gvoice' ? ' via Google Voice' : ''}`;
    return `<div class="msg ${cls}${failed ? ' failed' : ''}">${m.subject ? `<strong>${esc(m.subject)}</strong>\n` : ''}${esc(m.body)}
      <div class="meta">${esc(label)} · ${esc(fmtAgo(m.created_at))}${failed ? ` · NOT SENT: ${esc(m.error || m.status)}` : ''}</div></div>`;
  }

  function bindConversation(endpoint) {
    const form = $('#reply');
    const thread = $('#thread');
    thread.scrollTop = thread.scrollHeight;
    const syncChannel = () => {
      const ch = form.channel.value;
      form.subject.classList.toggle('hidden', ch !== 'email');
      $('#reply-hint').textContent = {
        note: 'Only visible to your team',
        sms: 'Sent from your business number',
        gvoice: `Opens Google Voice (${META.googleVoiceNumber}) with your message copied — paste & send`,
        sms_in: 'Paste a text the customer sent to your Google Voice number',
        email: 'Customer replies go to your inbox',
        chat: 'Appears in the customer\'s chat window on your website',
      }[ch];
      $('button', form).textContent = ch === 'gvoice' ? 'Copy & open Google Voice' : ch === 'sms_in' || ch === 'note' ? 'Save' : 'Send';
    };
    form.channel.onchange = syncChannel;
    syncChannel();
    $('#tpl').onchange = (e) => { if (e.target.value) form.body.value = e.target.value; e.target.selectedIndex = 0; form.body.focus(); };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('button', form);
      const ch = form.channel.value;
      if (!form.body.value.trim()) return toast('Type a message first', true);
      // Must run inside the click, before any await, or the browser blocks the new tab / clipboard.
      if (ch === 'gvoice') openGoogleVoice(form.dataset.phone, form.body.value);
      btn.disabled = true;
      try {
        await api(endpoint, { method: 'POST', body: { channel: ch, subject: form.subject.value, body: form.body.value } });
        toast({ chat: 'Sent to website chat ✅', note: 'Note saved', gvoice: 'Message copied — paste it in Google Voice and hit send', sms_in: 'Customer reply saved' }[ch] || 'Message sent ✅');
        render();
      } catch (err) {
        toast(err.message, true);
        if (err.data && err.data.message_record) render();
      } finally { btn.disabled = false; }
    };
  }

  // ---------- customers ----------
  async function customersPage(params) {
    const search = params.get('q') || '';
    const list = await api(`/customers?q=${encodeURIComponent(search)}`);
    app.innerHTML = `
      <div class="row between"><h1>Clients</h1>
        <div class="row"><a class="btn secondary" href="/api/admin/customers/export.csv?opted_in=1">⬇ Export marketing list</a>
        <a class="btn secondary" href="/api/admin/customers/export.csv">⬇ Export all</a>
        <button class="btn" id="add-customer">+ Add client</button></div></div>
      <form class="searchbar" id="search"><input name="q" placeholder="Search name, phone, email, address" value="${esc(search)}"><button class="btn secondary">Search</button></form>
      <p class="muted small">${list.length} client${list.length === 1 ? '' : 's'}</p>
      <div class="list">${list.length ? list.map((c) => `<a class="item" href="#/customers/${c.id}">
        <div class="main"><div class="title">${esc(c.name)} ${c.marketing_opt_in ? '<span title="OK to market">📣</span>' : ''}</div>
        <div class="sub">${esc([fmtPhone(c.phone), c.email, c.address].filter(Boolean).join(' · '))}</div></div>
        <div class="sub small">${c.job_count} job${c.job_count === 1 ? '' : 's'}</div></a>`).join('') : '<div class="empty">No clients found</div>'}</div>`;
    $('#search').onsubmit = (e) => { e.preventDefault(); location.hash = `#/customers?q=${encodeURIComponent(e.target.q.value)}`; };
    $('#add-customer').onclick = () => customerForm();
  }

  function customerForm(c) {
    const d = c || {};
    modal(c ? 'Edit client' : 'Add client', `<div class="form-grid">
      ${input('name', 'Full name *', d.name, { full: true })}
      ${input('phone', 'Phone', fmtPhone(d.phone), { type: 'tel' })}${input('email', 'Email', d.email, { type: 'email' })}
      ${input('address', 'Street address', d.address, { full: true })}
      ${input('city', 'City', d.city)}${input('zip', 'ZIP', d.zip)}
      ${textarea('notes', 'Notes (gate code, pets, preferences…)', d.notes)}
      ${checkbox('marketing_opt_in', 'OK to send offers & updates (email/text)', d.marketing_opt_in)}
      </div>`, async (data) => {
      if (c) { await api(`/customers/${c.id}`, { method: 'PUT', body: data }); toast('Client updated'); render(); }
      else { const created = await api('/customers', { method: 'POST', body: data }); toast('Client added'); location.hash = `#/customers/${created.id}`; }
    }, c ? { danger: { label: 'Delete client', confirm: 'Delete this client, their jobs and messages? This cannot be undone.', action: async () => { await api(`/customers/${c.id}`, { method: 'DELETE' }); location.hash = '#/customers'; } } } : {});
  }

  async function customerDetail(id) {
    const c = await api(`/customers/${id}`);
    app.innerHTML = `
      <p><a href="#/customers">← All clients</a></p>
      <div class="row between"><h1>${esc(c.name)}</h1>
        <div class="row"><button class="btn secondary" id="edit">Edit</button><button class="btn" id="book">📅 Book job</button></div></div>
      <div class="grid-2">
        <div>
          <div class="card">
            <dl class="kv">
              <dt>Phone</dt><dd>${esc(fmtPhone(c.phone)) || '—'}</dd>
              <dt>Email</dt><dd>${esc(c.email) || '—'}</dd>
              <dt>Address</dt><dd>${esc([c.address, c.city, c.zip].filter(Boolean).join(', ')) || '—'}</dd>
              <dt>Marketing OK</dt><dd>${c.marketing_opt_in ? '✅ Yes' : 'No'}</dd>
              <dt>Client since</dt><dd>${esc(utcDate(c.created_at).toLocaleDateString())} <span class="muted small">(${esc(c.source)})</span></dd>
              ${c.notes ? `<dt>Notes</dt><dd style="white-space:pre-wrap">${esc(c.notes)}</dd>` : ''}
            </dl>
            <div style="margin-top:14px">${contactLinks(c)}</div>
          </div>
          ${portalCard(c)}
          ${c.portal_account && c.portal_account.is_host || c.properties.length ? propertiesCard(c) : ''}
          <div class="card"><div class="row between"><h3>Invoices</h3><button class="btn sm secondary" id="new-invoice">+ Invoice</button></div>
            <div class="list">${c.invoices.length ? c.invoices.map(invoiceItem).join('') : '<div class="empty small">No invoices yet</div>'}</div></div>
          <div class="card"><h3>Jobs</h3><div class="list">${c.jobs.length ? c.jobs.slice().reverse().map(jobItem).join('') : '<div class="empty small">No jobs yet</div>'}</div></div>
          ${c.requests.length ? `<div class="card"><h3>Portal requests</h3><div class="list">${c.requests.map((r) => requestItem(r, { compact: true })).join('')}</div></div>` : ''}
          <div class="card"><h3>Quote requests</h3><div class="list">${c.leads.length ? c.leads.map(leadItem).join('') : '<div class="empty small">None</div>'}</div></div>
        </div>
        ${conversationCard(c.messages, c)}
      </div>`;
    $('#edit').onclick = () => customerForm(c);
    $('#book').onclick = () => jobForm({ customer_id: c.id, address: [c.address, c.city, c.zip].filter(Boolean).join(', ') });
    $('#new-invoice').onclick = () => invoiceForm({ customer_id: c.id });
    bindPortalCard(c);
    bindConversation(`/customers/${c.id}/messages`);
    bindJobItems();
    bindInvoiceItems();
    REQUESTS = c.requests;
    bindRequestItems();
  }

  // ---------- employees ----------
  async function employeesPage() {
    const list = await api('/employees');
    app.innerHTML = `
      <div class="row between"><h1>Employees</h1><button class="btn" id="add">+ Add employee</button></div>
      <div class="list">${list.length ? list.map((e) => `<a class="item" href="#/employees/${e.id}">
        <div class="main"><div class="title">${esc(e.name)} ${e.active ? '' : '<span class="status st-cancelled">inactive</span>'}</div>
        <div class="sub">${esc([e.role, fmtPhone(e.phone), e.email].filter(Boolean).join(' · '))}</div></div>
        <div class="sub small">${e.upcoming_jobs} upcoming</div></a>`).join('') : '<div class="empty">No employees yet. Add your cleaners so you can assign them to jobs.</div>'}</div>`;
    $('#add').onclick = () => employeeForm();
  }

  function employeeForm(e) {
    const d = e || { active: 1 };
    modal(e ? 'Edit employee' : 'Add employee', `<div class="form-grid">
      ${input('name', 'Full name *', d.name)}${input('role', 'Role', d.role || 'Cleaner')}
      ${input('phone', 'Mobile phone (for job texts)', fmtPhone(d.phone), { type: 'tel' })}${input('email', 'Email', d.email, { type: 'email' })}
      ${textarea('notes', 'Notes', d.notes)}
      ${checkbox('active', 'Active (can be assigned to jobs)', d.active)}
      </div>`, async (data) => {
      if (e) await api(`/employees/${e.id}`, { method: 'PUT', body: data });
      else await api('/employees', { method: 'POST', body: data });
      toast(e ? 'Employee updated' : 'Employee added');
      render();
    }, e ? { danger: { label: 'Delete', confirm: 'Delete this employee? (Tip: uncheck "Active" instead to keep their history.)', action: async () => { await api(`/employees/${e.id}`, { method: 'DELETE' }); location.hash = '#/employees'; } } } : {});
  }

  async function employeeDetail(id) {
    const e = await api(`/employees/${id}`);
    const today = localISO(new Date());
    const upcoming = e.jobs.filter((j) => j.scheduled_at >= today.slice(0, 10));
    const past = e.jobs.filter((j) => j.scheduled_at < today.slice(0, 10)).reverse();
    app.innerHTML = `
      <p><a href="#/employees">← All employees</a></p>
      <div class="row between"><h1>${esc(e.name)}</h1><button class="btn secondary" id="edit">Edit</button></div>
      <div class="card"><dl class="kv">
        <dt>Role</dt><dd>${esc(e.role)}</dd><dt>Phone</dt><dd>${esc(fmtPhone(e.phone)) || '—'}</dd>
        <dt>Email</dt><dd>${esc(e.email) || '—'}</dd><dt>Status</dt><dd>${e.active ? 'Active' : 'Inactive'}</dd>
        ${e.notes ? `<dt>Notes</dt><dd>${esc(e.notes)}</dd>` : ''}</dl>
        <div style="margin-top:14px">${contactLinks(e)}</div></div>
      <div class="grid-2">
        <div class="card"><h3>Upcoming jobs</h3><div class="list">${upcoming.length ? upcoming.map(jobItem).join('') : '<div class="empty small">None</div>'}</div></div>
        <div class="card"><h3>Past jobs</h3><div class="list">${past.length ? past.slice(0, 30).map(jobItem).join('') : '<div class="empty small">None</div>'}</div></div>
      </div>`;
    $('#edit').onclick = () => employeeForm(e);
    bindJobItems();
  }

  // ---------- jobs ----------
  const jobItem = (j) => `<a class="item" href="#" data-job="${j.id}">
      <div class="main"><div class="title">${esc(fmtWhen(j.scheduled_at))} — ${esc(j.customer ? j.customer.name : '')}</div>
      <div class="sub">${esc([j.property && `🏠 ${j.property.name}`, j.service_type, j.address].filter(Boolean).join(' · '))}</div>
      <div class="sub">${j.employees.length ? `🧹 ${esc(j.employees.map((e) => e.name).join(', '))}` : '<span style="color:var(--warn)">⚠️ No cleaner assigned</span>'}</div></div>
      <div style="text-align:right">${status(j.status)}<div class="sub small">${money(j.price)}</div></div></a>`;

  function bindJobItems() {
    $$('[data-job]').forEach((a) => (a.onclick = async (e) => {
      e.preventDefault();
      try { jobForm(await api(`/jobs/${a.dataset.job}`)); } catch (err) { toast(err.message, true); }
    }));
  }

  async function jobsPage(params) {
    const view = params.get('view') || 'upcoming';
    const today = localISO(new Date()).slice(0, 10);
    const query = view === 'upcoming' ? `?from=${today}&status=scheduled` : view === 'unassigned' ? '?status=scheduled' : view === 'past' ? `?to=${today}` : '';
    let jobs = await api(`/jobs${query}`);
    if (view === 'unassigned') jobs = jobs.filter((j) => !j.employees.length);
    if (view === 'past' || view === 'all') jobs.reverse();
    app.innerHTML = `
      <div class="row between"><h1>Bookings</h1><button class="btn" id="add">+ New job</button></div>
      <div class="tabs">${[['upcoming', 'Upcoming'], ['unassigned', 'Needs cleaner'], ['past', 'Past'], ['all', 'All']].map(([v, l]) => `<button data-v="${v}" class="${v === view ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="list">${jobs.length ? jobs.map(jobItem).join('') : '<div class="empty">No jobs here</div>'}</div>`;
    $$('.tabs button').forEach((b) => (b.onclick = () => { location.hash = `#/jobs?view=${b.dataset.v}`; }));
    $('#add').onclick = () => jobForm({});
    bindJobItems();
  }

  async function jobForm(job) {
    const [customers, employees, properties] = await Promise.all([api('/customers'), api('/employees'), api('/properties')]);
    if (!customers.length) { toast('Add a client first', true); location.hash = '#/customers'; return; }
    const existing = Boolean(job.id);
    const assigned = new Set((job.employees || []).map((e) => e.id));
    const defaultTime = new Date(); defaultTime.setDate(defaultTime.getDate() + 1); defaultTime.setHours(9, 0, 0, 0);
    const services = [...new Set([...Object.values(META.pricing.services).map((s) => s.label), 'Airbnb / STR Turnover', job.service_type].filter(Boolean))];
    const form = modal(existing ? 'Edit job' : 'Book a job', `<div class="form-grid">
      ${select('customer_id', 'Client *', [['', '— Choose client —'], ...customers.map((c) => [c.id, `${c.name}${c.phone ? ` · ${fmtPhone(c.phone)}` : ''}`])], job.customer_id, { full: true })}
      ${input('scheduled_at', 'Date & time *', job.scheduled_at || localISO(defaultTime), { type: 'datetime-local' })}
      ${input('duration_hours', 'Duration (hours)', job.duration_hours || 3, { type: 'number', attrs: 'step="0.5" min="0.5"' })}
      ${select('service_type', 'Service', [['', '—'], ...services.map((s) => [s, s])], job.service_type)}
      ${input('price', 'Price ($)', job.price ?? '', { type: 'number', attrs: 'step="1"' })}
      <div class="field full" id="property-field"><label for="f-property_id">Rental property (turnovers)</label><select id="f-property_id" name="property_id"></select></div>
      ${input('address', 'Address (defaults to client or property address)', job.address, { full: true })}
      ${existing ? `<div class="field full"><div class="row"><button type="button" class="btn sm secondary" id="job-report">📝 Report & photos</button><button type="button" class="btn sm secondary" id="job-invoice">🧾 Create invoice</button></div></div>` : ''}
      ${existing ? select('status', 'Status', META.jobStatuses.map((s) => [s, s]), job.status, { full: true }) : ''}
      <div class="field full"><label>Assign cleaner(s)</label>
        ${employees.filter((e) => e.active || assigned.has(e.id)).map((e) => `<label class="check"><input type="checkbox" name="employee_ids" data-multi="1" value="${e.id}" ${assigned.has(e.id) ? 'checked' : ''}> ${esc(e.name)} <span class="muted small">${esc(fmtPhone(e.phone))}</span></label>`).join('') || '<div class="muted small">No employees yet — <a href="#/employees">add one</a>.</div>'}
      </div>
      ${checkbox('notify_employees', META.smsConfigured ? 'Text/email newly assigned cleaners the job details' : 'Email newly assigned cleaners the job details', true)}
      ${existing && !META.smsConfigured && (job.employees || []).some((e) => e.phone) ? `<div class="field full"><label>Text cleaners (Google Voice)</label><div class="row">${job.employees.filter((e) => e.phone).map((e) => `<button type="button" class="btn sm secondary" data-gv="${esc(e.phone)}">💬 Text ${esc(e.name.split(' ')[0])}</button>`).join('')}</div><div class="muted small">Copies the job details and opens Google Voice.</div></div>` : ''}
      ${textarea('notes', 'Job notes (visible to cleaner in their text)', job.notes)}
      <input type="hidden" name="lead_id" value="${esc(job.lead_id ?? '')}">
      </div>`, async (data) => {
      data.employee_ids ||= [];
      const saved = existing ? await api(`/jobs/${job.id}`, { method: 'PUT', body: data }) : await api('/jobs', { method: 'POST', body: data });
      const failed = (saved.notifications || []).filter((n) => !n.ok);
      if (failed.length) toast(`Job saved, but ${failed.length} cleaner notification(s) failed: ${failed[0].error}`, true);
      else if (!META.smsConfigured && saved.employees.some((e) => e.phone)) toast('Job saved. Open the job to text cleaners via Google Voice.');
      else toast(saved.notifications && saved.notifications.length ? 'Job saved & cleaners notified ✅' : 'Job saved');
      render();
    }, { submitLabel: existing ? 'Save job' : 'Book job', danger: existing ? { label: 'Delete job', confirm: 'Delete this job?', action: async () => { await api(`/jobs/${job.id}`, { method: 'DELETE' }); render(); } } : null });
    const jobText = `Shine Pro Cleaning job: ${fmtWhen(job.scheduled_at || '')} at ${job.address || ''}${job.customer ? ` for ${job.customer.name}` : ''}${job.service_type ? ` (${job.service_type})` : ''}.${job.notes ? ` Notes: ${job.notes}` : ''}`;
    $$('[data-gv]', form).forEach((b) => (b.onclick = () => { openGoogleVoice(b.dataset.gv, jobText); toast('Job details copied — paste in Google Voice'); }));
    // Property list follows the chosen client (only hosts have properties).
    const syncProperties = () => {
      const mine = properties.filter((p) => String(p.customer_id) === form.customer_id.value);
      form.property_id.innerHTML = [['', '— Not a turnover —'], ...mine.map((p) => [p.id, p.name])]
        .map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(job.property_id ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
      $('#property-field', form).classList.toggle('hidden', !mine.length);
    };
    syncProperties();
    form.property_id.addEventListener('change', () => {
      const p = properties.find((x) => String(x.id) === form.property_id.value);
      if (p) { form.address.value = p.address || ''; if (!form.service_type.value) form.service_type.value = form.service_type.querySelector('option[value="Airbnb / STR Turnover"]') ? 'Airbnb / STR Turnover' : ''; }
    });
    // Auto-fill address from selected client
    form.customer_id.addEventListener('change', () => {
      syncProperties();
      const c = customers.find((x) => String(x.id) === form.customer_id.value);
      if (c && !form.address.value) form.address.value = [c.address, c.city, c.zip].filter(Boolean).join(', ');
    });
    if (existing) {
      $('#job-report', form).onclick = () => { form.closest('.modal-backdrop').remove(); reportForm(job); };
      $('#job-invoice', form).onclick = () => { form.closest('.modal-backdrop').remove(); invoiceForm({ customer_id: job.customer_id, job_id: job.id, amount: job.price }); };
    }
  }

  // ---------- calendar ----------
  async function calendarPage(params) {
    const start = params.get('week') ? new Date(`${params.get('week')}T00:00`) : new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay()); // Sunday
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const day = (d) => localISO(d).slice(0, 10);
    const jobs = await api(`/jobs?from=${day(start)}&to=${day(end)}`);
    const prev = new Date(start); prev.setDate(prev.getDate() - 7);
    const todayStr = day(new Date());
    const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
    app.innerHTML = `
      <div class="row between"><h1>Calendar</h1>
        <div class="row"><a class="btn secondary" href="#/calendar?week=${day(prev)}">‹ Prev</a><a class="btn secondary" href="#/calendar">Today</a><a class="btn secondary" href="#/calendar?week=${day(end)}">Next ›</a><button class="btn" id="add">+ New job</button></div></div>
      <p class="muted">${esc(start.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }))} – ${esc(new Date(end - 1).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }))} · ${jobs.length} job(s)</p>
      <div class="week">${days.map((d) => {
        const ds = day(d);
        const list = jobs.filter((j) => j.scheduled_at.startsWith(ds));
        return `<div class="day ${ds === todayStr ? 'today' : ''}"><div class="dh">${esc(d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' }))}</div>
          ${list.map((j) => `<a href="#" class="ev ${j.employees.length ? '' : 'unassigned'} ${j.status}" data-job="${j.id}"><strong>${esc(fmtTime(j.scheduled_at))}</strong> ${esc(j.customer ? j.customer.name : '')}<br><span class="muted">${j.employees.length ? esc(j.employees.map((e) => e.name.split(' ')[0]).join(', ')) : '⚠️ unassigned'}</span></a>`).join('')}</div>`;
      }).join('')}</div>`;
    $('#add').onclick = () => jobForm({});
    bindJobItems();
  }

  // ---------- alerts ----------
  async function alertsPage() {
    const [s, log] = await Promise.all([api('/stats'), api('/notifications')]);
    const a = s.alerts;
    const row = (ok, text) => `<div>${ok ? '✅' : '❌'} ${text}</div>`;
    app.innerHTML = `
      <h1>Alerts</h1>
      <div class="card">
        <h2>How you get notified about new leads</h2>
        ${row(a.email_configured, 'Email sending (SMTP)')}
        ${row(a.alert_emails > 0, `Alert email address(es): ${a.alert_emails}`)}
        ${a.sms_configured ? row(a.alert_phones > 0, `Alert phone number(s): ${a.alert_phones}`) : `<div>📱 Texting uses Google Voice <strong>${esc(a.google_voice_number)}</strong>. New-lead alerts come by email, so turn on Gmail notifications on your phone to see them instantly.</div>`}
        <h3 style="margin-top:16px">Website chat</h3>
        ${row(META.chat.aiEnabled, 'AI assistant (ANTHROPIC_API_KEY)')}
        ${row(!META.chat.phoneVerification || META.chat.phoneVerificationReady, META.chat.phoneVerification ? 'Phone verification (Firebase)' : 'Phone verification is OFF (testing only)')}
        ${row(a.email_configured, 'Email verification codes (SMTP)')}
        <p class="muted small">These are set in the server's environment settings (see README). Every lead is saved in the Leads page even if an alert fails.</p>
        <button class="btn" id="test">Send test alert</button>
      </div>
      <div class="card">
        <h2>Recent notifications</h2>
        <div class="list">${log.length ? log.map((n) => `<div class="item"><div class="main"><div class="title">${esc(n.kind.replace(/_/g, ' '))} · ${esc(n.channel)} → ${esc(n.recipient || '')}</div>
          <div class="sub">${esc(fmtAgo(n.created_at))}${n.error ? ` · ${esc(n.error)}` : ''}${n.lead_id ? ` · <a href="#/leads/${n.lead_id}">lead #${n.lead_id}</a>` : ''}</div></div>${status(n.status)}</div>`).join('') : '<div class="empty">Nothing sent yet</div>'}</div>
      </div>`;
    $('#test').onclick = async (e) => {
      e.target.disabled = true;
      try {
        const r = await api('/test-alert', { method: 'POST', body: {} });
        const bad = r.filter((x) => !x.ok);
        toast(bad.length ? `${bad.length} failed: ${bad[0].error}` : 'Test alerts sent ✅', bad.length > 0);
        render();
      } catch (err) { toast(err.message, true); } finally { e.target.disabled = false; }
    };
  }

  // ---------- client portal access (on the client page) ----------
  function portalCard(c) {
    const a = c.portal_account;
    const portalUrl = `${location.origin}/${a && a.is_host ? 'host' : 'portal'}`;
    if (!a) {
      return `<div class="card"><h3>Client portal</h3>
        <p class="muted small">${c.email ? `Lets ${esc(c.name.split(' ')[0])} log in to see bookings, request changes and pay invoices. We email them a link to set their password.` : 'Add an email address to this client first. It becomes their portal login.'}</p>
        ${c.email ? `<div class="row"><button class="btn sm" data-portal="enable">Turn on & email link</button><button class="btn sm secondary" data-portal="enable-host">Turn on as host (Airbnb)</button></div>` : ''}</div>`;
    }
    return `<div class="card"><div class="row between"><h3>Client portal</h3>${a.enabled ? '<span class="status st-booked">on</span>' : '<span class="status st-cancelled">off</span>'}</div>
      <dl class="kv">
        <dt>Login</dt><dd>${esc(a.email)}</dd>
        <dt>Type</dt><dd>${a.is_host ? '🏠 Host (rental properties)' : '👤 Client'}</dd>
        <dt>Password</dt><dd>${a.has_password ? 'Set' : '<span style="color:var(--warn)">Not set yet</span>'}</dd>
        <dt>Last login</dt><dd>${a.last_login_at ? esc(fmtAgo(a.last_login_at)) : 'Never'}</dd>
        <dt>Email updates</dt><dd>${a.email_updates ? 'On' : 'Off (client turned them off)'}</dd>
        <dt>Portal</dt><dd><a href="${esc(portalUrl)}" target="_blank" rel="noopener">${esc(portalUrl)}</a></dd>
      </dl>
      <div class="row" style="margin-top:12px">
        ${a.enabled ? `<button class="btn sm" data-portal="invite">✉️ Email set-password link</button>` : ''}
        <button class="btn sm secondary" data-portal="${a.is_host ? 'unhost' : 'host'}">${a.is_host ? 'Remove host' : 'Mark as host'}</button>
        <button class="btn sm ${a.enabled ? 'danger' : 'secondary'}" data-portal="${a.enabled ? 'disable' : 'reenable'}">${a.enabled ? 'Turn off access' : 'Turn access back on'}</button>
      </div></div>`;
  }

  function bindPortalCard(c) {
    const put = (body) => api(`/customers/${c.id}/portal`, { method: 'PUT', body });
    const actions = {
      enable: async () => { const r = await put({ enabled: true, send_link: true }); return r.email && r.email.ok ? 'Portal on. Set-password link emailed ✅' : `Portal on, but the email failed: ${r.email ? r.email.error : ''}`; },
      'enable-host': async () => { const r = await put({ enabled: true, is_host: true, send_link: true }); return r.email && r.email.ok ? 'Host portal on. Link emailed ✅' : `Host portal on, but the email failed: ${r.email ? r.email.error : ''}`; },
      invite: async () => { await api(`/customers/${c.id}/portal/invite`, { method: 'POST', body: {} }); return 'Set-password link emailed ✅'; },
      host: async () => { await put({ is_host: true }); return 'Marked as host'; },
      unhost: async () => { await put({ is_host: false }); return 'No longer a host'; },
      disable: async () => { if (!confirm('Turn off portal access? They will be logged out right away.')) return null; await put({ enabled: false }); return 'Portal access turned off'; },
      reenable: async () => { await put({ enabled: true }); return 'Portal access turned back on'; },
    };
    $$('[data-portal]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { const msg = await actions[b.dataset.portal](); if (msg) { toast(msg, /failed/.test(msg)); render(); } } catch (err) { toast(err.message, true); } finally { b.disabled = false; }
    }));
    $$('[data-property]').forEach((b) => (b.onclick = () => propertyForm(c.id, c.properties.find((p) => String(p.id) === b.dataset.property))));
    const add = $('#add-property');
    if (add) add.onclick = () => propertyForm(c.id);
  }

  // ---------- properties (hosts) ----------
  const clock = (hhmm) => (hhmm ? new Date(`2000-01-01T${hhmm}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
  function propertiesCard(c) {
    return `<div class="card"><div class="row between"><h3>🏠 Rental properties</h3><button class="btn sm secondary" id="add-property">+ Property</button></div>
      <div class="list">${c.properties.length ? c.properties.map((p) => `<a class="item" href="#" data-property="${p.id}">
        <div class="main"><div class="title">${esc(p.name)}</div>
        <div class="sub">${esc([p.address, p.bedrooms != null ? `${p.bedrooms} bd / ${p.bathrooms ?? '?'} ba` : '', p.checkout_time ? `out ${clock(p.checkout_time)}` : '', p.checkin_time ? `in ${clock(p.checkin_time)}` : ''].filter(Boolean).join(' · '))}</div>
        ${p.access_notes ? `<div class="sub">🔑 ${esc(p.access_notes)}</div>` : ''}</div>
        <div class="sub small">${p.next_turnover ? `Next: ${esc(fmtWhen(p.next_turnover))}` : `${p.turnover_count} turnover(s)`}</div></a>`).join('') : '<div class="empty small">No properties yet. The host can add them in their portal, or add one here.</div>'}</div></div>`;
  }

  function propertyForm(customerId, p) {
    const d = p || { checkout_time: '11:00', checkin_time: '16:00' };
    modal(p ? 'Edit property' : 'Add property', `<div class="form-grid">
      ${input('name', 'Name *', d.name, { full: true })}
      ${input('address', 'Address *', d.address, { full: true })}
      ${input('bedrooms', 'Bedrooms', d.bedrooms, { type: 'number' })}${input('bathrooms', 'Bathrooms', d.bathrooms, { type: 'number', attrs: 'step="0.5"' })}
      ${input('checkout_time', 'Usual checkout', d.checkout_time, { type: 'time' })}${input('checkin_time', 'Usual check-in', d.checkin_time, { type: 'time' })}
      ${textarea('access_notes', 'Access (lockbox, codes, parking)', d.access_notes)}
      ${textarea('notes', 'Notes', d.notes)}
      </div>`, async (data) => {
      if (p) await api(`/properties/${p.id}`, { method: 'PUT', body: data });
      else await api('/properties', { method: 'POST', body: { ...data, customer_id: customerId } });
      toast(p ? 'Property saved' : 'Property added');
      render();
    }, p ? { danger: { label: 'Delete', confirm: 'Delete this property? Its turnover jobs are kept.', action: async () => { await api(`/properties/${p.id}`, { method: 'DELETE' }); render(); } } } : {});
  }

  // ---------- invoices ----------
  const invStatus = (i) => (i.status === 'sent' ? status(i.overdue ? 'failed' : 'new').replace(/>(failed|new)</, `>${i.overdue ? 'overdue' : 'sent'}<`) : status(i.status));
  const invoiceItem = (i) => `<a class="item" href="#" data-invoice="${i.id}">
      <div class="main"><div class="title">${esc(i.number)} · ${esc(i.customer ? i.customer.name : '')}</div>
      <div class="sub">${esc([i.job && `${i.job.service_type || 'Job'} ${fmtWhen(i.job.scheduled_at)}`, i.due_date && `due ${i.due_date}`, i.pay_url && '💳 pay link', !i.job && i.notes && i.notes.slice(0, 60)].filter(Boolean).join(' · '))}</div></div>
      <div style="text-align:right">${invStatus(i)}<div class="sub small">${moneyCents(i.amount)}</div></div></a>`;
  const moneyCents = (n) => `$${Number(n || 0).toFixed(2)}`;

  function bindInvoiceItems() {
    $$('[data-invoice]').forEach((a) => (a.onclick = async (e) => {
      e.preventDefault();
      try { invoiceForm(await api(`/invoices/${a.dataset.invoice}`)); } catch (err) { toast(err.message, true); }
    }));
  }

  async function invoicesPage(params) {
    const st = params.get('status') || 'all';
    const list = await api(`/invoices?status=${encodeURIComponent(st)}`);
    const total = list.filter((i) => i.status === 'sent').reduce((sum, i) => sum + i.amount, 0);
    app.innerHTML = `
      <div class="row between"><h1>Invoices</h1><button class="btn" id="add">+ New invoice</button></div>
      <div class="tabs">${[['all', 'All'], ['draft', 'Draft'], ['open', 'Unpaid'], ['paid', 'Paid'], ['void', 'Void']].map(([v, l]) => `<button data-st="${v}" class="${v === st ? 'active' : ''}">${l}</button>`).join('')}</div>
      <p class="muted small">${list.length} invoice(s)${total ? ` · ${moneyCents(total)} unpaid` : ''}. Tip: open a booking and press “Create invoice” to bill a job.</p>
      <div class="list">${list.length ? list.map(invoiceItem).join('') : '<div class="empty">No invoices here</div>'}</div>`;
    $$('.tabs button').forEach((b) => (b.onclick = () => { location.hash = `#/invoices?status=${b.dataset.st}`; }));
    $('#add').onclick = () => invoiceForm({});
    bindInvoiceItems();
  }

  async function invoiceForm(inv) {
    const existing = Boolean(inv.id);
    const customers = existing ? [] : await api('/customers');
    if (!existing && !customers.length) { toast('Add a client first', true); return; }
    const due = new Date(); due.setDate(due.getDate() + 7);
    const jobOptions = async (customerId) => (customerId ? (await api(`/jobs?customer_id=${customerId}`)).reverse() : []);
    const jobs = await jobOptions(inv.customer_id);
    const jobSelect = (list, value) => [['', '— No job (blank invoice) —'], ...list.map((j) => [j.id, `${fmtWhen(j.scheduled_at)} · ${j.service_type || 'Job'}${j.price != null ? ` · ${money(j.price)}` : ''}`])]
      .map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const form = modal(existing ? `Invoice ${inv.number}` : 'New invoice', `<div class="form-grid">
      ${existing ? `<div class="field full"><label>Client</label><div>${esc(inv.customer.name)} <span class="muted small">${esc(inv.customer.email || 'no email on file')}</span></div></div>`
        : select('customer_id', 'Client *', [['', '— Choose client —'], ...customers.map((c) => [c.id, `${c.name}${c.email ? ` · ${c.email}` : ''}`])], inv.customer_id, { full: true })}
      <div class="field full"><label for="f-job_id">Job</label><select id="f-job_id" name="job_id">${jobSelect(jobs, inv.job_id)}</select></div>
      ${input('amount', 'Amount ($) *', inv.amount ?? '', { type: 'number', attrs: 'step="0.01" min="0"' })}
      ${input('due_date', 'Due date', inv.due_date || (existing ? '' : localISO(due).slice(0, 10)), { type: 'date' })}
      ${existing ? input('number', 'Invoice number', inv.number) : ''}
      ${select('status', 'Status', META.invoiceStatuses.map((x) => [x, x]), inv.status || 'draft')}
      ${input('pay_url', 'Pay link (Stripe Payment Link, https://…)', inv.pay_url, { type: 'url', full: true, attrs: 'placeholder="https://buy.stripe.com/…"' })}
      ${textarea('notes', 'Notes shown on the invoice', inv.notes)}
      ${existing ? `<div class="field full"><div class="row">
        <button type="button" class="btn sm" data-inv="send">✉️ Save & email to client</button>
        ${inv.status !== 'paid' ? '<button type="button" class="btn sm secondary" data-inv="paid">✅ Mark paid</button>' : ''}
        ${inv.status !== 'void' ? '<button type="button" class="btn sm secondary" data-inv="void">Void</button>' : ''}
        <a class="btn sm secondary" href="/admin/invoices/${inv.id}" target="_blank" rel="noopener">🖨 Printable</a>
      </div><div class="muted small" style="margin-top:6px">${inv.sent_at ? `Sent ${esc(fmtAgo(inv.sent_at))}. ` : ''}${inv.paid_at ? `Paid ${esc(fmtAgo(inv.paid_at))}. ` : ''}The email has the amount, due date, Pay link and a link to view the invoice in the client portal.</div></div>` : ''}
      </div>`, async (data) => {
      if (data.job_id === '') data.job_id = null;
      if (existing) await api(`/invoices/${inv.id}`, { method: 'PUT', body: data });
      else await api('/invoices', { method: 'POST', body: data });
      toast(existing ? 'Invoice saved' : 'Invoice created');
      render();
    }, { submitLabel: existing ? 'Save' : 'Create invoice', danger: existing ? { label: 'Delete', confirm: 'Delete this invoice? (Tip: use Void to keep a record.)', action: async () => { await api(`/invoices/${inv.id}`, { method: 'DELETE' }); render(); } } : null });
    // Picking a job fills in the amount from the job's price.
    const fillFromJob = (list) => {
      const j = list.find((x) => String(x.id) === form.job_id.value);
      if (j && j.price != null && !form.amount.value) form.amount.value = j.price;
    };
    let current = jobs;
    form.job_id.onchange = () => fillFromJob(current);
    if (!existing) {
      form.customer_id.onchange = async () => {
        current = await jobOptions(form.customer_id.value);
        form.job_id.innerHTML = jobSelect(current, '');
      };
    }
    $$('[data-inv]', form).forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try {
        const data = formData(form);
        if (data.job_id === '') data.job_id = null;
        if (b.dataset.inv === 'paid') data.status = 'paid';
        if (b.dataset.inv === 'void') { if (!confirm('Void this invoice? The client will see it as void.')) return; data.status = 'void'; }
        await api(`/invoices/${inv.id}`, { method: 'PUT', body: data });
        if (b.dataset.inv === 'send') { await api(`/invoices/${inv.id}/send`, { method: 'POST', body: {} }); toast('Invoice emailed to the client ✅'); }
        else toast(b.dataset.inv === 'paid' ? 'Marked paid ✅' : 'Invoice voided');
        form.closest('.modal-backdrop').remove();
        render();
      } catch (err) { toast(err.message, true); } finally { b.disabled = false; }
    }));
  }

  // ---------- requests inbox ----------
  const kindLabel = { reschedule: '🔁 Reschedule', cancel: '✖️ Cancel', turnover: '🏠 Turnover' };
  function requestSummary(r) {
    if (r.kind === 'turnover') return `${r.property ? r.property.name : 'Property'} · ${r.requested_at}${r.checkout_time ? ` · checkout ${clock(r.checkout_time)}` : ''}${r.checkin_time ? ` · next check-in ${clock(r.checkin_time)}` : ''}`;
    const when = r.job ? fmtWhen(r.job.scheduled_at) : 'job deleted';
    return r.kind === 'reschedule' ? `${when} → ${fmtWhen(r.requested_at)}` : when;
  }
  const requestItem = (r, { compact = false } = {}) => `<div class="item" style="align-items:flex-start">
      <div class="main"><div class="title">${kindLabel[r.kind]}${compact ? '' : ` · <a href="#/customers/${r.customer_id}">${esc(r.customer ? r.customer.name : '')}</a>`}</div>
      <div class="sub">${esc(requestSummary(r))}</div>
      ${r.note ? `<div class="sub">“${esc(r.note)}”</div>` : ''}
      ${r.admin_note ? `<div class="sub">Your reply: ${esc(r.admin_note)}</div>` : ''}
      <div class="sub small">${esc(fmtAgo(r.created_at))}${!compact && r.customer && r.customer.phone ? ` · ${esc(fmtPhone(r.customer.phone))}` : ''}</div>
      ${r.status === 'pending' ? `<div class="row" style="margin-top:8px"><button class="btn sm" data-approve="${r.id}">Approve</button><button class="btn sm danger" data-decline="${r.id}">Decline</button></div>` : ''}</div>
      ${status(r.status === 'pending' ? 'new' : r.status === 'approved' ? 'booked' : 'cancelled').replace(/>(new|booked|cancelled)</, `>${r.status}<`)}</div>`;

  let REQUESTS = [];
  function bindRequestItems() {
    const find = (id) => REQUESTS.find((r) => String(r.id) === id);
    $$('[data-approve]').forEach((b) => (b.onclick = () => approveForm(find(b.dataset.approve))));
    $$('[data-decline]').forEach((b) => (b.onclick = () => declineForm(find(b.dataset.decline))));
  }

  async function requestsPage(params) {
    const st = params.get('status') || 'pending';
    REQUESTS = await api(`/requests?status=${encodeURIComponent(st)}`);
    app.innerHTML = `
      <h1>Client requests</h1>
      <p class="muted small">Reschedule, cancel and turnover requests from the client and host portals. Approving updates or creates the booking; the client is emailed either way.</p>
      <div class="tabs">${['pending', 'approved', 'declined', 'all'].map((v) => `<button data-st="${v}" class="${v === st ? 'active' : ''}">${v}</button>`).join('')}</div>
      <div class="list">${REQUESTS.length ? REQUESTS.map((r) => requestItem(r)).join('') : `<div class="empty">${st === 'pending' ? 'No requests waiting 🎉' : 'Nothing here'}</div>`}</div>`;
    $$('.tabs button').forEach((b) => (b.onclick = () => { location.hash = `#/requests?status=${b.dataset.st}`; }));
    bindRequestItems();
  }

  async function approveForm(r) {
    let fields = '';
    if (r.kind === 'reschedule') {
      fields = input('scheduled_at', 'New date & time (change it if you agreed another time)', r.requested_at, { type: 'datetime-local', full: true });
    } else if (r.kind === 'turnover') {
      const employees = await api('/employees');
      fields = `${input('scheduled_at', 'Cleaning starts', `${r.requested_at}T${r.checkout_time || (r.property && r.property.checkout_time) || '11:00'}`, { type: 'datetime-local' })}
        ${input('duration_hours', 'Duration (hours)', 3, { type: 'number', attrs: 'step="0.5" min="0.5"' })}
        ${input('price', 'Price ($)', '', { type: 'number', attrs: 'step="1"' })}
        <div class="field full"><label>Assign cleaner(s)</label>${employees.filter((e) => e.active).map((e) => `<label class="check"><input type="checkbox" name="employee_ids" data-multi="1" value="${e.id}"> ${esc(e.name)}</label>`).join('') || '<div class="muted small">No employees yet.</div>'}</div>`;
    }
    modal(`Approve: ${kindLabel[r.kind]}`, `<p><strong>${esc(r.customer ? r.customer.name : '')}</strong><br><span class="muted">${esc(requestSummary(r))}</span></p>
      ${r.note ? `<p class="muted">“${esc(r.note)}”</p>` : ''}
      <div class="form-grid">${fields}${textarea('admin_note', 'Message to the client (optional, included in their email)', '')}</div>
      <p class="muted small">${r.kind === 'cancel' ? 'The booking is marked cancelled.' : r.kind === 'reschedule' ? 'The booking moves and assigned cleaners are told.' : 'A turnover booking is created for this property.'}</p>`, async (data) => {
      const res = await api(`/requests/${r.id}/approve`, { method: 'POST', body: data });
      toast(res.email && res.email.ok ? 'Approved. Client emailed ✅' : `Approved. Client not emailed: ${res.email ? res.email.error : ''}`, !(res.email && res.email.ok));
      render();
    }, { submitLabel: 'Approve' });
  }

  function declineForm(r) {
    modal(`Decline: ${kindLabel[r.kind]}`, `<p><strong>${esc(r.customer ? r.customer.name : '')}</strong><br><span class="muted">${esc(requestSummary(r))}</span></p>
      <div class="form-grid">${textarea('admin_note', 'Reason / message to the client', '')}</div>`, async (data) => {
      const res = await api(`/requests/${r.id}/decline`, { method: 'POST', body: data });
      toast(res.email && res.email.ok ? 'Declined. Client emailed' : `Declined. Client not emailed: ${res.email ? res.email.error : ''}`, !(res.email && res.email.ok));
      render();
    }, { submitLabel: 'Decline' });
  }

  // ---------- job / turnover report with photos ----------
  // Big phone photos are shrunk in the browser before upload (max 2000px, JPEG).
  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Couldn't read ${file.name}`));
      reader.onload = () => {
        if (file.size < 1.5 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(file.type)) return resolve(reader.result);
        const img = new Image();
        img.onerror = () => resolve(reader.result);
        img.onload = () => {
          const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function reportForm(job) {
    let report = await api(`/jobs/${job.id}/report`);
    const photosHtml = () => (report.photos.length ? `<div class="photo-grid">${report.photos.map((p) => `<a href="/api/admin/photos/${job.id}/${esc(p.file)}" target="_blank" rel="noopener"><img src="/api/admin/photos/${job.id}/${esc(p.file)}" alt="${esc(p.name)}"><button type="button" class="btn sm danger photo-del" data-del="${esc(p.file)}" title="Delete photo">✕</button></a>`).join('')}</div>` : '<div class="muted small">No photos yet.</div>');
    const form = modal(`Report · ${fmtWhen(job.scheduled_at)}${job.property ? ` · ${job.property.name}` : ''}`, `<div class="form-grid">
      ${textarea('notes', 'Cleaning notes (what was done)', report.notes)}
      ${textarea('damage_notes', 'Damage found', report.damage_notes)}
      ${textarea('inventory_notes', 'Inventory / supplies (low or missing items)', report.inventory_notes)}
      <div class="field full"><label>Photos</label><div id="photos">${photosHtml()}</div>
        <label class="btn sm secondary" style="margin-top:10px;width:auto">📷 Add photos<input type="file" id="photo-input" accept="image/jpeg,image/png,image/webp,image/gif" multiple class="hidden"></label>
        <span class="muted small" id="photo-status"></span></div>
      </div><p class="muted small">${job.property ? 'The host sees this report and the photos in their portal.' : 'Saved with the booking.'} Photos upload right away; press Save for the notes.</p>`, async (data) => {
      await api(`/jobs/${job.id}/report`, { method: 'PUT', body: data });
      toast('Report saved ✅');
      render();
    }, { submitLabel: 'Save report' });
    const refresh = () => {
      $('#photos', form).innerHTML = photosHtml();
      $$('[data-del]', form).forEach((b) => (b.onclick = async (e) => {
        e.preventDefault();
        if (!confirm('Delete this photo?')) return;
        try { report = await api(`/jobs/${job.id}/report/photos/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); refresh(); } catch (err) { toast(err.message, true); }
      }));
    };
    refresh();
    $('#photo-input', form).onchange = async (e) => {
      const files = [...e.target.files];
      const statusEl = $('#photo-status', form);
      for (const [i, file] of files.entries()) {
        statusEl.textContent = `Uploading ${i + 1} of ${files.length}…`;
        try {
          report = await api(`/jobs/${job.id}/report/photos`, { method: 'POST', body: { name: file.name, data: await readPhoto(file) } });
          refresh();
        } catch (err) { toast(`${file.name}: ${err.message}`, true); }
      }
      statusEl.textContent = '';
      e.target.value = '';
    };
  }


  // ---------- boot ----------
  async function start() {
    const session = await fetch('/api/admin/session').then((r) => r.json());
    if (!session.loggedIn) return showLogin();
    META = await api('/meta');
    $('#topbar').classList.remove('hidden');
    render();
  }

  window.addEventListener('hashchange', () => { if (META) render(); });
  // Re-check for new leads every minute while the page is open.
  setInterval(() => { if (META && !document.hidden) refreshBadge(); }, 60000);
  start();
})();

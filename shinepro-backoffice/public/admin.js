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
    el.setAttribute('role', isError ? 'alert' : 'status');
    el.textContent = msg;
    // Several messages at once stack instead of covering each other.
    let stack = document.getElementById('toasts');
    if (!stack) { stack = document.createElement('div'); stack.id = 'toasts'; document.body.appendChild(stack); }
    stack.appendChild(el);
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
  // An itemized estimate (from public/pricing.js, priced by the server) as a small table.
  const lineAmount = (l) => (l.kind === 'included' ? 'Included' : l.kind === 'travel' ? money(l.amount) : `${l.amount < 0 ? '−' : ''}${money(Math.abs(l.amount))}`);
  const linesTable = (b) => (b && b.lines ? `<table class="lines">${b.lines.map((l) => `<tr><td>${esc(l.label.replace(/ — (included|\$\d+)$/, ''))}</td><td class="num">${esc(lineAmount(l))}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="num">${b.total != null ? money(b.total) : 'Custom quote'}</td></tr></table>` : '');
  // Delivery log rows (emails/texts) with a Retry button for failed ones.
  const notificationItem = (n) => `<div class="item"><div class="main"><div class="title">${esc(n.kind.replace(/_/g, ' '))} · ${esc(n.channel)} → ${esc(n.recipient || '')}</div>
      <div class="sub">${esc(fmtAgo(n.updated_at || n.created_at))}${n.attempts > 1 ? ` · ${n.attempts} attempts` : ''}${n.error ? ` · ${esc(n.error)}` : ''}${n.lead_id ? ` · <a href="#/leads/${n.lead_id}">lead #${n.lead_id}</a>` : ''}${n.form_id ? ' · <a href="#/forms">website form</a>' : ''}</div></div>
      <div style="text-align:right">${status(n.status)}${['failed', 'skipped'].includes(n.status) ? `<div style="margin-top:6px"><button type="button" class="btn sm secondary" data-retry="${n.id}">↻ Retry</button></div>` : ''}</div></div>`;
  function bindRetry() {
    $$('[data-retry]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { await api(`/notifications/${b.dataset.retry}/retry`, { method: 'POST', body: {} }); toast('Sent ✅'); } catch (err) { toast(`Still not sent: ${err.message}`, true); }
      render();
    }));
  }
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
        if (el.dataset.multi) { (out[el.name] ||= []); if (el.checked) out[el.name].push(el.dataset.multi === 'str' ? el.value : Number(el.value)); }
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
    document.body.classList.add('logged-out');
    app.innerHTML = `<div class="login-wrap"><form class="card login" id="login-form">
      <img src="/logo.png" alt="Shine Pro Cleaning" width="720" height="152" style="display:block;width:220px;height:auto;margin:0 auto 6px"><p class="muted" style="text-align:center;margin:0 0 16px">Back office</p>
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

  // ---------- pop-up alerts: a chime and a desktop notification for new chats, leads and call-backs ----------
  let lastCounts = null;
  const alertsOn = () => { try { return localStorage.getItem('sp-alerts') === '1'; } catch { return false; } };
  function chime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [880, 1175].forEach((f, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16);
        g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.16 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.35);
        o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.16); o.stop(ctx.currentTime + i * 0.16 + 0.4);
      });
    } catch { /* no sound available */ }
  }
  function alertIfNew(s) {
    const counts = { chats: s.unread_chats, leads: s.new_leads, callbacks: s.callbacks, requests: s.pending_requests };
    const prev = lastCounts; lastCounts = counts;
    if (!prev || !alertsOn()) return;
    const msgs = [];
    if (counts.callbacks > prev.callbacks) msgs.push(['📞 Call-back requested', 'A customer asked you to call them.', '#/leads?status=new']);
    if (counts.chats > prev.chats) msgs.push(['💬 New chat message', 'A customer wrote in the website chat.', '#/chats']);
    if (counts.leads > prev.leads) msgs.push(['📈 New lead', 'Someone asked for an estimate.', '#/leads?status=new']);
    if (counts.requests > prev.requests) msgs.push(['📨 New client request', 'A client asked to reschedule, cancel or book a turnover.', '#/requests']);
    if (!msgs.length) return;
    chime();
    const [title, body, href] = msgs[0];
    toast(`${title}: ${body}`);
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      const n = new Notification(title, { body, icon: '/favicon.svg', tag: href });
      n.onclick = () => { window.focus(); location.hash = href; n.close(); };
    }
  }
  function syncAlertsButton() {
    $('#alerts-toggle').textContent = alertsOn() ? '🔔 Pop-up alerts are on' : '🔈 Turn on pop-up alerts';
  }
  $('#alerts-toggle').onclick = async () => {
    const on = !alertsOn();
    try { localStorage.setItem('sp-alerts', on ? '1' : '0'); } catch { /* private mode */ }
    if (on) {
      chime();
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission().catch(() => {});
      toast('Pop-up alerts are on. You\'ll hear a chime for new chats, leads and call-backs while the admin is open.');
    }
    syncAlertsButton();
  };
  syncAlertsButton();
  $('#tab-more').onclick = () => document.body.classList.toggle('menu-open');
  $('#scrim').onclick = () => document.body.classList.remove('menu-open');
  $('#side-book').onclick = () => { document.body.classList.remove('menu-open'); jobForm({}); };
  $('#tab-book').onclick = () => jobForm({});

  // ---------- router ----------
  const routes = [
    [/^\/?$/, dashboard],
    [/^\/leads$/, leadsPage],
    [/^\/leads\/(\d+)$/, leadDetail],
    [/^\/chats$/, chatsPage],
    [/^\/chats\/(\d+)$/, chatDetail],
    [/^\/customers$/, customersPage],
    [/^\/customers\/(\d+)$/, customerDetail],
    [/^\/employees$/, employeesPage],
    [/^\/employees\/(\d+)$/, employeeDetail],
    [/^\/jobs$/, jobsPage],
    [/^\/calendar$/, calendarPage],
    [/^\/alerts$/, alertsPage],
    [/^\/invoices$/, invoicesPage],
    [/^\/requests$/, requestsPage],
    [/^\/forms$/, formsPage],
  ];

  let pagePoll = null; // a live page (chat) refreshes itself; cleared whenever the page changes
  async function render() {
    if (pagePoll) { clearInterval(pagePoll); pagePoll = null; }
    const hash = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = hash.split('?');
    const params = new URLSearchParams(qs || '');
    const section = path.split('/')[1] || '';
    $$('#nav a[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === section));
    $$('.tabbar a[data-tab]').forEach((a) => a.classList.toggle('active', a.dataset.tab === section));
    document.body.classList.remove('menu-open');
    window.scrollTo(0, 0);
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
      const fb = $('#forms-badge');
      fb.textContent = s.unread_forms;
      fb.classList.toggle('hidden', !s.unread_forms);
      const cb = $('#chats-badge');
      cb.textContent = s.unread_chats;
      cb.classList.toggle('hidden', !s.unread_chats);
      $('#tab-chats-dot').classList.toggle('hidden', !s.unread_chats);
      $('#tab-more-dot').classList.toggle('hidden', !(s.new_leads || s.pending_requests || s.unread_forms));
      const waiting = s.new_leads + s.unread_chats;
      document.title = `${waiting ? `(${waiting}) ` : ''}Back Office · Shine Pro Cleaning`;
      alertIfNew(s);
    } catch { /* ignore */ }
  }

  // ---------- Today ----------
  // Cleaner colours: the same cleaner always gets the same colour on every page.
  const CLEANER_COLORS = [['#1b6f66', '#e3f1ee'], ['#3d5a98', '#e8edf8'], ['#8a4f9e', '#f3e9f6'], ['#b4531a', '#fbebe0'],
    ['#2f7d32', '#e6f3e6'], ['#a23b5b', '#f8e6ec'], ['#5c6b2e', '#eef1e2'], ['#1f6f8b', '#e2f1f6']];
  const cleanerColor = (id) => CLEANER_COLORS[(Number(id) || 0) % CLEANER_COLORS.length];
  const jobColorVars = (j) => {
    if (!j.employees || !j.employees.length) return '--c:#9a7400;--c-soft:#fdf4d3';
    const [c, soft] = cleanerColor(j.employees[0].id);
    return `--c:${c};--c-soft:${soft}`;
  };
  const cleanerChips = (j) => (j.employees && j.employees.length
    ? j.employees.map((e) => `<span class="chip"><i style="background:${cleanerColor(e.id)[0]}"></i>${esc(e.name.split(' ')[0])}</span>`).join(' ')
    : '<span class="chip none">No cleaner yet</span>');
  const mapLink = (addr) => (addr ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}` : null);
  const dayStr = (d) => localISO(d).slice(0, 10);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const repeatLabel = { weekly: 'Weekly', biweekly: 'Every 2 weeks', every4weeks: 'Every 4 weeks', monthly: 'Monthly' };

  async function dashboard() {
    const now = new Date();
    const today = dayStr(now);
    const weekStart = addDays(now, -now.getDay());
    const [s, jobs] = await Promise.all([
      api('/stats'),
      api(`/jobs?from=${dayStr(weekStart)}&to=${dayStr(addDays(weekStart, 14))}`),
    ]);
    const live = jobs.filter((j) => j.status !== 'cancelled');
    const todays = live.filter((j) => j.scheduled_at.startsWith(today));
    const tomorrow = dayStr(addDays(now, 1));
    const tomorrows = live.filter((j) => j.scheduled_at.startsWith(tomorrow));
    const thisWeek = live.filter((j) => j.scheduled_at < dayStr(addDays(weekStart, 7)));
    const sum = (list) => list.reduce((t, j) => t + (Number(j.price) || 0), 0);
    const hour = now.getHours();
    const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const nowLocal = localISO(now);

    const a = s.alerts;
    const waiting = [
      s.callbacks && { n: s.callbacks, t: `asked you to call them back`, href: '#/leads?status=new', urgent: true },
      s.unread_chats && { n: s.unread_chats, t: `website chat${s.unread_chats > 1 ? 's' : ''} with new messages`, href: '#/chats', urgent: true },
      s.new_leads && { n: s.new_leads, t: `new lead${s.new_leads > 1 ? 's' : ''} to contact`, href: '#/leads?status=new' },
      s.pending_requests && { n: s.pending_requests, t: `client request${s.pending_requests > 1 ? 's' : ''} to answer`, href: '#/requests' },
      s.unassigned_jobs && { n: s.unassigned_jobs, t: `booking${s.unassigned_jobs > 1 ? 's' : ''} without a cleaner`, href: '#/jobs?view=unassigned' },
      s.unread_forms && { n: s.unread_forms, t: `unread website form${s.unread_forms > 1 ? 's' : ''}`, href: '#/forms' },
      s.failed_alerts && { n: s.failed_alerts, t: `email${s.failed_alerts > 1 ? 's' : ''} that didn't send`, href: '#/alerts', urgent: true },
    ].filter(Boolean);
    const setupProblems = [];
    if (!a.email_configured) setupProblems.push('email sending is not set up, so customers get no emails');
    if (!a.alert_emails) setupProblems.push('no ALERT_EMAILS address is set');

    const routeItem = (j) => {
      const done = j.status === 'completed';
      const end = new Date(new Date(j.scheduled_at).getTime() + (j.duration_hours || 3) * 3600e3);
      const isNow = !done && j.scheduled_at <= nowLocal && localISO(end) > nowLocal;
      const map = mapLink(j.address);
      return `<li class="${done ? 'done' : ''}${isNow ? ' now' : ''}">
        <div class="time">${esc(fmtTime(j.scheduled_at))}<small>${esc(j.duration_hours || 3)} h${isNow ? ' · now' : ''}</small></div>
        <div><div class="who">${esc(j.customer ? j.customer.name : 'Client')}${j.repeat ? ` <span title="${esc(repeatLabel[j.repeat] || '')}">🔁</span>` : ''}</div>
          <div class="where">${esc([j.service_type, j.address].filter(Boolean).join(' · '))}</div>
          <div style="margin-top:6px">${cleanerChips(j)}</div>
          <div class="acts">
            <button type="button" class="btn sm secondary" data-job="${j.id}">Open</button>
            ${map ? `<a class="btn sm secondary" href="${esc(map)}" target="_blank" rel="noopener">Directions</a>` : ''}
            ${j.customer && j.customer.phone ? `<a class="btn sm secondary" href="tel:${esc(j.customer.phone)}">Call</a>` : ''}
            ${done || j.scheduled_at.slice(0, 10) > today ? '' : `<button type="button" class="btn sm" data-done="${j.id}">Mark done</button>`}
          </div></div></li>`;
    };

    app.innerHTML = `
      <div class="today-head"><div><h1>${hello}</h1><div class="date">${esc(now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</div></div>
        <div class="row"><a class="btn secondary" href="#/calendar">Open calendar</a><button class="btn" id="quick-book">＋ Book a cleaning</button></div></div>
      ${setupProblems.length ? `<div class="banner warn"><strong>Finish setup:</strong> ${esc(setupProblems.join('; '))}. <a href="#/alerts">See email settings</a></div>` : ''}
      <div class="today-grid">
        <div>
          <section class="panel"><h2>Today's cleanings <span class="aside">${todays.length ? `${todays.filter((j) => j.status === 'completed').length} of ${todays.length} done` : ''}</span></h2>
            ${todays.length ? `<ol class="route">${todays.map(routeItem).join('')}</ol>` : '<p class="all-clear">No cleanings today. Tap ＋ Book a cleaning to add one.</p>'}
          </section>
          <section class="panel"><h2>Tomorrow <a href="#/calendar?view=day&date=${tomorrow}">See the day</a></h2>
            ${tomorrows.length ? `<ol class="route">${tomorrows.map(routeItem).join('')}</ol>
              <p class="muted small">${META.reminders ? 'Clients get a reminder email the day before, automatically.' : 'Reminder emails are turned off.'}</p>` : '<p class="all-clear">Nothing booked for tomorrow yet.</p>'}
          </section>
        </div>
        <div>
          <section class="panel"><h2>Waiting on you</h2>
            ${waiting.length ? `<ul class="waiting">${waiting.map((w) => `<li class="${w.urgent ? 'urgent' : ''}"><a href="${w.href}"><span class="count">${w.n}</span><span>${esc(w.t)}</span><span class="go">›</span></a></li>`).join('')}</ul>`
              : '<p class="all-clear">Nothing is waiting. You\'re all caught up.</p>'}
          </section>
          <section class="panel"><h2>This week <a href="#/calendar">Calendar</a></h2>
            <div class="week-strip">${[...Array(7)].map((_, i) => {
              const d = addDays(weekStart, i); const ds = dayStr(d);
              const n = live.filter((j) => j.scheduled_at.startsWith(ds)).length;
              return `<a href="#/calendar?view=day&date=${ds}" class="${ds === today ? 'today' : ''}"><div class="d">${esc(d.toLocaleDateString(undefined, { weekday: 'short' }))}</div><div class="n${n ? '' : ' zero'}">${n}</div></a>`;
            }).join('')}</div>
            <div class="money"><div><strong>${thisWeek.length}</strong>cleanings</div><div><strong>${money(sum(thisWeek)) || '$0'}</strong>booked</div><div><strong>${money(sum(thisWeek.filter((j) => j.status === 'completed'))) || '$0'}</strong>done</div></div>
          </section>
        </div>
      </div>`;
    $('#quick-book').onclick = () => jobForm({});
    $$('[data-done]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try {
        const j = await api(`/jobs/${b.dataset.done}`);
        await api(`/jobs/${j.id}`, { method: 'PUT', body: { ...j, status: 'completed', employee_ids: j.employees.map((e) => e.id), notify_employees: false } });
        toast('Marked done ✅');
        render();
      } catch (err) { toast(err.message, true); b.disabled = false; }
    }));
    $$('button[data-job]').forEach((b) => (b.onclick = async () => { try { jobForm(await api(`/jobs/${b.dataset.job}`)); } catch (err) { toast(err.message, true); } }));
  }

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
      ${lead ? '' : select('service_type', 'Service', services, l.service_type) + select('frequency', 'Frequency (recurring only)', freqs, l.frequency)
        + select('size', 'Home size', META.pricing.sizes.map((z) => [z.id, z.label]), '2') + input('bathrooms', 'Bathrooms', l.bathrooms, { type: 'number', attrs: 'step="0.5"' })
        + `<div class="field full"><label>Add-ons (priced by the server from pricing.js; included ones are free)</label>${META.pricing.addons.map((a) => `<label class="check"><input type="checkbox" name="addons" data-multi="str" value="${esc(a.id)}"> ${esc(a.label)} <span class="muted small">${money(a.price)}${a.perHour ? '/hr' : ''}</span></label>`).join('')}</div>`
        + input('organizing_hours', 'Organizing hours', 2, { type: 'number', attrs: 'min="1" max="8"' })
        + input('preferred_time', 'Preferred time', l.preferred_time)}
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
      <p><a class="back" href="#/leads">← Back</a></p>
      <div class="row between"><h1>${esc(l.name)}</h1>
        <div class="row">
          <select id="lead-status" style="width:auto">${META.leadStatuses.map((s) => `<option ${s === l.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <button class="btn secondary" id="edit-lead">Edit</button>
          ${l.has_chat ? `<a class="btn secondary" href="#/chats/${l.id}">💬 Live chat</a>` : ''}
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
              ${l.addons ? `<dt>Add-ons</dt><dd>${esc(l.addons.split(',').map((id) => (META.pricing.addons.find((a) => a.id === id) || { label: id }).label).join(', '))}${l.organizing_hours ? ` (${l.organizing_hours} hr organizing)` : ''}</dd>` : ''}
              <dt>Preferred date</dt><dd>${esc([l.preferred_date, l.preferred_time].filter(Boolean).join(' ')) || '—'}</dd>
              ${l.preferred_contact ? `<dt>Contact by</dt><dd>${esc(l.preferred_contact)}</dd>` : ''}
              ${l.referred_by ? `<dt>Referred by</dt><dd>${esc(l.referred_by)}</dd>` : ''}
              ${l.gift_code ? `<dt>Gift card</dt><dd>${esc(l.gift_code)}</dd>` : ''}
              <dt>Estimate</dt><dd><strong>${money(l.estimated_price) || (l.breakdown ? 'Custom quote' : '—')}</strong>${l.breakdown ? linesTable(l.breakdown) : ''}</dd>
              <dt>Marketing OK</dt><dd>${l.marketing_opt_in ? '✅ Yes' : 'No'}</dd>
              ${l.callback_requested ? `<dt>Call back</dt><dd><strong style="color:var(--danger)">📞 Requested</strong></dd>` : ''}
              <dt>Admin alerted</dt><dd>${l.admin_notified ? '✅ Yes' : '⚠️ No — alert failed or not configured'}</dd>
              ${l.message ? `<dt>Message</dt><dd style="white-space:pre-wrap">${esc(l.message)}</dd>` : ''}
            </dl>
            <div style="margin-top:14px">${contactLinks(l)}</div>
          </div>
          ${l.customer ? `<div class="card"><h3>Client record</h3><a class="item" href="#/customers/${l.customer.id}"><div class="main"><div class="title">${esc(l.customer.name)}</div><div class="sub">${esc([fmtPhone(l.customer.phone), l.customer.email].filter(Boolean).join(' · '))}</div></div><span>›</span></a></div>` : ''}
          ${l.jobs.length ? `<div class="card"><h3>Jobs</h3><div class="list">${l.jobs.map(jobItem).join('')}</div></div>` : ''}
          <div class="card"><h3>Emails & texts about this lead</h3>
            <div class="list">${l.notifications.length ? l.notifications.map(notificationItem).join('') : '<div class="empty small">Nothing sent yet</div>'}</div>
            <p class="muted small">Failed ones are retried automatically (3 tries). Press Retry to send one again.</p></div>
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
    bindRetry();
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
    return `<div class="msg ${cls}${failed ? ' failed' : ''}" data-id="${m.id}">${m.subject ? `<strong>${esc(m.subject)}</strong>\n` : ''}${esc(m.body)}
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
        const sent = await api(endpoint, { method: 'POST', body: { channel: ch, subject: form.subject.value, body: form.body.value } });
        if (sent && sent.emailed) toast("Sent to the chat and emailed (they're not on the website right now) ✅");
        else toast({ chat: 'Sent to website chat ✅', note: 'Note saved', gvoice: 'Message copied — paste it in Google Voice and hit send', sms_in: 'Customer reply saved' }[ch] || 'Message sent ✅');
        render();
      } catch (err) {
        toast(err.message, true);
        if (err.data && err.data.message_record) render();
      } finally { btn.disabled = false; }
    };
  }

  // ---------- website chats ----------
  const seenText = (c) => (c.online ? '<span class="online">● On the website now</span>' : c.last_seen_at ? `Last on the website ${esc(fmtAgo(c.last_seen_at))}` : '');
  async function chatsPage() {
    const draw = async () => {
      const list = await api('/chats');
      if (!location.hash.startsWith('#/chats')) return;
      app.innerHTML = `
        <div class="row between"><h1>Website chats</h1><span class="muted small">Updates by itself</span></div>
        <p class="muted small">Customers who started a chat on the website. Open one to reply: your message appears in their chat window right away, and if they've left the website it's emailed to them too.</p>
        <div class="list">${list.length ? list.map((c) => `<a class="item${c.unread ? ' unread' : ''}" href="#/chats/${c.lead_id}">
          <div class="main"><div class="title">${c.unread ? `<span class="badge">${c.unread}</span> ` : ''}${esc(c.name)} ${c.online ? '<span class="online">●</span>' : ''}</div>
          <div class="sub">${esc(c.last_direction === 'in' ? '' : c.last_status === 'ai' ? 'Assistant: ' : c.last_status === 'auto' ? 'Automatic: ' : 'You: ')}${esc((c.last_body || '').slice(0, 120))}</div>
          <div class="sub">${esc([fmtPhone(c.phone), c.email].filter(Boolean).join(' · '))}</div></div>
          <div style="text-align:right" class="sub small">${esc(fmtAgo(c.last_at))}${c.callback_requested ? '<div style="color:var(--danger)">📞 Call back</div>' : ''}</div></a>`).join('') : '<div class="empty">No website chats yet</div>'}</div>`;
    };
    await draw();
    pagePoll = setInterval(() => { if (!document.hidden) draw().catch(() => {}); }, 10000);
  }

  async function chatDetail(leadId) {
    const c = await api(`/chats/${leadId}`);
    let lastId = c.messages.reduce((m, x) => Math.max(m, x.id), 0);
    app.innerHTML = `
      <p><a class="back" href="#/chats">← Back</a></p>
      <div class="row between"><div><h1 style="margin-bottom:4px">${esc(c.name)}</h1><div class="muted small" id="chat-presence">${seenText(c)}</div></div>
        <div class="row">${contactLinks(c)}<a class="btn sm secondary" href="#/leads/${c.lead_id}">Lead details</a><button class="btn sm" id="chat-book">📅 Book job</button></div></div>
      <div class="card chat-live">
        <div class="thread" id="thread">${c.messages.map(msgHtml).join('')}</div>
        <form id="chat-reply" class="chat-compose">
          <textarea name="body" placeholder="Type your reply… (Enter sends, Shift+Enter for a new line)" rows="2"></textarea>
          <button class="btn">Send</button>
        </form>
        <div class="chat-quick" id="chat-quick">${[
          `Hi ${esc(c.name.split(' ')[0])}! This is Shine Pro Cleaning. How can I help?`,
          'What day and time work best for you?',
          'How many bedrooms and bathrooms do you have?',
          'Thanks! I\'m booking you now. You\'ll get a confirmation email in a minute.',
          'Can I call you? It\'s quicker to set this up by phone.',
        ].map((t) => `<button type="button" data-q="${t}">${t.length > 42 ? `${t.slice(0, 40)}…` : t}</button>`).join('')}</div>
        <div class="row between" style="margin-top:6px"><span class="muted small" id="assistant-state"></span><button type="button" class="btn sm secondary hidden" id="give-back">Let the assistant answer again</button></div>
      </div>`;
    const thread = $('#thread');
    const form = $('#chat-reply');
    const paintState = (st) => {
      $('#chat-presence').innerHTML = seenText(st);
      $('#assistant-state').textContent = st.you_are_chatting
        ? "You're chatting: the AI assistant stays quiet for 30 minutes after your last reply."
        : 'The AI assistant answers new questions until you reply.';
      $('#give-back').classList.toggle('hidden', !st.you_are_chatting);
    };
    paintState(c);
    thread.scrollTop = thread.scrollHeight;
    const pull = async () => {
      const n = await api(`/chats/${leadId}?after=${lastId}`);
      if (!location.hash.startsWith(`#/chats/${leadId}`)) return;
      paintState(n);
      const fresh = n.messages.filter((m) => m.id > lastId && !thread.querySelector(`[data-id="${m.id}"]`));
      if (!fresh.length) return;
      const atBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 60;
      thread.insertAdjacentHTML('beforeend', fresh.map(msgHtml).join(''));
      lastId = Math.max(lastId, ...fresh.map((m) => m.id));
      if (atBottom) thread.scrollTop = thread.scrollHeight;
      refreshBadge();
    };
    pagePoll = setInterval(() => { if (!document.hidden) pull().catch(() => {}); }, 4000);
    form.body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    $$('#chat-quick button').forEach((b) => (b.onclick = () => { form.body.value = b.dataset.q; form.body.focus(); }));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const text = form.body.value.trim();
      if (!text) return;
      const btn = $('button', form);
      btn.disabled = true;
      try {
        const m = await api(`/leads/${leadId}/messages`, { method: 'POST', body: { channel: 'chat', body: text } });
        form.body.value = '';
        if (m.emailed === false) toast(`Sent to the chat, but the email copy failed: ${m.email_error}`, true);
        else if (m.emailed) toast("Sent. They're not on the website right now, so it was emailed to them too ✅");
        await pull();
      } catch (err) { toast(err.message, true); } finally { btn.disabled = false; form.body.focus(); }
    };
    $('#give-back').onclick = async () => { await api(`/chats/${leadId}/assistant`, { method: 'POST', body: {} }); pull(); };
    $('#chat-book').onclick = async () => {
      const l = await api(`/leads/${leadId}`);
      jobForm({ customer_id: l.customer_id, lead_id: l.id, address: [l.address, l.zip].filter(Boolean).join(' '), service_type: serviceLabel(l.service_type), price: l.estimated_price });
    };
    form.body.focus();
    refreshBadge();
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
      <p><a class="back" href="#/customers">← Back</a></p>
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
      <p><a class="back" href="#/employees">← Back</a></p>
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
      <div class="main"><div class="title">${esc(fmtWhen(j.scheduled_at))} — ${esc(j.customer ? j.customer.name : '')}${j.repeat ? ` <span title="${esc(repeatLabel[j.repeat] || 'Repeating')}">🔁</span>` : ''}</div>
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
    const existing = Boolean(job.id);
    const assigned = new Set((job.employees || []).map((e) => e.id));
    const defaultTime = new Date(); defaultTime.setDate(defaultTime.getDate() + 1); defaultTime.setHours(9, 0, 0, 0);
    const services = [...new Set([...Object.values(META.pricing.services).map((s) => s.label), 'Airbnb / STR Turnover', job.service_type].filter(Boolean))];
    const clientLabel = (c) => `${c.name}${c.phone ? ` · ${fmtPhone(c.phone)}` : ''}${c.email ? ` · ${c.email}` : ''}`;
    const form = modal(existing ? 'Edit booking' : 'Book a cleaning', `<div class="form-grid">
      ${existing ? '' : `<div class="field full"><label for="f-client-search">Find client (name, phone or email)</label><input id="f-client-search" type="search" placeholder="Start typing…" autocomplete="off"></div>`}
      ${select('customer_id', 'Client *', [['', customers.length ? '— Choose client —' : '— No clients yet —'], ...(existing ? [] : [['new', '➕ New client…']]), ...customers.map((c) => [c.id, clientLabel(c)])], job.customer_id ?? (customers.length ? '' : 'new'), { full: true })}
      <div class="field full hidden" id="new-client"><div class="form-grid">
        ${input('nc_name', 'New client name *', '')}
        ${input('nc_phone', 'Phone', '', { type: 'tel' })}
        ${input('nc_email', 'Email (for the confirmation)', '', { type: 'email' })}
        ${input('nc_address', 'Address', '')}
      </div></div>
      <div class="field full"><label>Quick pick</label><div class="row chips" id="quick-times">
        ${[['Tomorrow 9 AM', 1, 9], ['Tomorrow 1 PM', 1, 13], ['In 2 days 9 AM', 2, 9], ['Next week 9 AM', 7, 9]].map(([l, d, h]) => `<button type="button" class="btn sm secondary" data-days="${d}" data-hour="${h}">${l}</button>`).join('')}
      </div></div>
      ${input('scheduled_at', 'Date & time *', job.scheduled_at || localISO(defaultTime), { type: 'datetime-local' })}
      ${input('duration_hours', 'Duration (hours)', job.duration_hours || 3, { type: 'number', attrs: 'step="0.5" min="0.5"' })}
      ${existing ? (job.series_id ? `<div class="field full"><div class="series-note">🔁 ${esc(repeatLabel[job.repeat] || 'Repeating')} booking. Changes here apply to this visit only.
        ${job.status === 'scheduled' ? '<div style="margin-top:8px"><button type="button" class="btn sm danger" id="cancel-following">Cancel this and all later visits</button></div>' : ''}</div></div>` : '')
        : `<div class="field full"><label for="f-repeat">Repeat</label><div class="repeat-row">
          <select id="f-repeat" name="repeat"><option value="">Doesn't repeat</option><option value="weekly">Every week</option><option value="biweekly">Every 2 weeks</option><option value="every4weeks">Every 4 weeks</option><option value="monthly">Every month (same date)</option></select>
          <select name="repeat_count" aria-label="How many visits">${[4, 6, 8, 10, 12, 16, 20, 26].map((n) => `<option value="${n}" ${n === 8 ? 'selected' : ''}>${n} visits</option>`).join('')}</select>
        </div><div class="muted small" id="repeat-hint"></div></div>`}
      ${select('service_type', 'Service', [['', '—'], ...services.map((s) => [s, s])], job.service_type)}
      ${input('price', 'Price ($)', job.price ?? '', { type: 'number', attrs: 'step="1"' })}
      <div class="field full" id="property-field"><label for="f-property_id">Rental property (turnovers)</label><select id="f-property_id" name="property_id"></select></div>
      ${input('address', 'Address (defaults to client or property address)', job.address, { full: true })}
      ${existing ? `<div class="field full"><div class="row"><button type="button" class="btn sm secondary" id="job-report">📝 Report & photos</button><button type="button" class="btn sm secondary" id="job-invoice">🧾 Create invoice</button></div></div>` : ''}
      ${existing ? select('status', 'Status', META.jobStatuses.map((s) => [s, s]), job.status, { full: true }) : ''}
      ${job.price_breakdown && job.price_breakdown.lines ? `<div class="field full"><label>Estimate from the lead</label>${linesTable(job.price_breakdown)}</div>` : ''}
      <div class="field full"><label>Assign cleaner(s)</label>
        ${employees.filter((e) => e.active || assigned.has(e.id)).map((e) => `<label class="check"><input type="checkbox" name="employee_ids" data-multi="1" value="${e.id}" ${assigned.has(e.id) ? 'checked' : ''}> ${esc(e.name)} <span class="muted small">${esc(fmtPhone(e.phone))}</span></label>`).join('') || '<div class="muted small">No employees yet — <a href="#/employees">add one</a>.</div>'}
        <div class="warn-box hidden" id="conflicts"></div>
      </div>
      ${checkbox('notify_customer', existing ? 'Email the client if the date, time or address changes, or the job is cancelled' : 'Email the client a booking confirmation now', true)}
      <div class="muted small field full" id="notify-customer-hint"></div>
      ${checkbox('notify_employees', META.smsConfigured ? 'Text/email newly assigned cleaners the job details' : 'Email newly assigned cleaners the job details', true)}
      ${existing && !META.smsConfigured && (job.employees || []).some((e) => e.phone) ? `<div class="field full"><label>Text cleaners (Google Voice)</label><div class="row">${job.employees.filter((e) => e.phone).map((e) => `<button type="button" class="btn sm secondary" data-gv="${esc(e.phone)}">💬 Text ${esc(e.name.split(' ')[0])}</button>`).join('')}</div><div class="muted small">Copies the job details and opens Google Voice.</div></div>` : ''}
      ${textarea('notes', 'Job notes (visible to cleaner in their text)', job.notes)}
      <input type="hidden" name="lead_id" value="${esc(job.lead_id ?? '')}">
      </div>`, async (data) => {
      data.employee_ids ||= [];
      if (data.customer_id === 'new') {
        if (!data.nc_name.trim()) throw new Error("Type the new client's name");
        data.new_customer = { name: data.nc_name, phone: data.nc_phone, email: data.nc_email, address: data.nc_address };
        data.customer_id = '';
        if (!data.address) data.address = data.nc_address;
      }
      for (const k of ['nc_name', 'nc_phone', 'nc_email', 'nc_address']) delete data[k];
      if (!data.repeat) { delete data.repeat; delete data.repeat_count; }
      const saved = existing ? await api(`/jobs/${job.id}`, { method: 'PUT', body: data }) : await api('/jobs', { method: 'POST', body: data });
      const failed = (saved.notifications || []).filter((n) => !n.ok);
      const cn = saved.customer_notification;
      if (saved.series) toast(`🔁 Booked ${saved.series.dates.length} visits, through ${fmtWhen(saved.series.dates.at(-1))}`);
      if (cn) {
        if (cn.ok || cn.retrying) toast(`✅ Client emailed at ${cn.to}`);
        else toast(`Job saved, but the client email ${cn.status === 'skipped' ? 'was not sent' : 'failed'}: ${cn.error}`, true);
      }
      if (saved.warnings && saved.warnings.length) toast(`Job saved. Heads up: ${saved.warnings.map((w) => w.message).join(' ')}`, true);
      else if (failed.length) toast(`Job saved, but ${failed.length} cleaner notification(s) failed: ${failed[0].error}`, true);
      else if (!META.smsConfigured && saved.employees.some((e) => e.phone)) toast('Job saved. Open the job to text cleaners via Google Voice.');
      else toast(saved.notifications && saved.notifications.length ? 'Job saved & cleaners notified ✅' : 'Job saved');
      render();
    }, { submitLabel: existing ? 'Save booking' : 'Book cleaning', danger: existing ? { label: 'Delete job', confirm: 'Delete this job?', action: async () => { await api(`/jobs/${job.id}`, { method: 'DELETE' }); render(); } } : null });
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
    // Find a client by typing; the list narrows to matches and picks the only one.
    const search = $('#f-client-search', form);
    if (search) {
      const allOptions = [...form.customer_id.options].map((o) => [o.value, o.textContent]);
      search.addEventListener('input', () => {
        const term = search.value.trim().toLowerCase();
        const termDigits = term.replace(/\D/g, '');
        const keep = allOptions.filter(([v, l]) => !v || v === 'new' || !term || l.toLowerCase().includes(term) || (termDigits.length >= 3 && l.replace(/\D/g, '').includes(termDigits)));
        const current = form.customer_id.value;
        form.customer_id.innerHTML = keep.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
        const matches = keep.filter(([v]) => v && v !== 'new');
        form.customer_id.value = matches.length === 1 ? matches[0][0] : keep.some(([v]) => v === current) ? current : '';
        form.customer_id.dispatchEvent(new Event('change'));
      });
      search.focus();
    }
    const syncNewClient = () => {
      const isNew = form.customer_id.value === 'new';
      $('#new-client', form).classList.toggle('hidden', !isNew);
      const c = customers.find((x) => String(x.id) === form.customer_id.value);
      const email = isNew ? form.nc_email.value.trim() : c && c.email;
      $('#notify-customer-hint', form).textContent = form.notify_customer.checked
        ? (email ? `Goes to ${email}` : isNew ? 'Add an email above so they get the confirmation.' : form.customer_id.value ? "This client has no email address, so they won't get one. Add it on their client page." : '')
        : '';
    };
    form.customer_id.addEventListener('change', syncNewClient);
    form.notify_customer.addEventListener('change', syncNewClient);
    form.nc_email.addEventListener('input', syncNewClient);
    syncNewClient();
    const repeatHint = () => {
      if (!form.repeat || !$('#repeat-hint', form)) return;
      form.repeat_count.disabled = !form.repeat.value;
      $('#repeat-hint', form).textContent = form.repeat.value && form.scheduled_at.value
        ? `${form.repeat_count.value} visits starting ${fmtWhen(form.scheduled_at.value)}. The client gets one email listing the dates.` : '';
    };
    if (form.repeat) { form.repeat.addEventListener('change', repeatHint); form.repeat_count.addEventListener('change', repeatHint); form.scheduled_at.addEventListener('change', repeatHint); repeatHint(); }
    if ($('#cancel-following', form)) $('#cancel-following', form).onclick = async () => {
      const email = job.customer && job.customer.email;
      if (!confirm(`Cancel this visit and every later visit in this repeating booking?${email ? `\n\n${email} will be emailed.` : ''}`)) return;
      try {
        const r = await api(`/jobs/${job.id}/cancel-following`, { method: 'POST', body: { notify_customer: Boolean(email) } });
        form.closest('.modal-backdrop').remove();
        toast(`Cancelled ${r.cancelled} visit${r.cancelled === 1 ? '' : 's'}${r.customer_notification && (r.customer_notification.ok || r.customer_notification.retrying) ? ' and emailed the client' : ''} ✅`);
        render();
      } catch (err) { toast(err.message, true); }
    };
    $$('#quick-times button', form).forEach((b) => (b.onclick = () => {
      const d = new Date(); d.setDate(d.getDate() + Number(b.dataset.days)); d.setHours(Number(b.dataset.hour), 0, 0, 0);
      form.scheduled_at.value = localISO(d);
      form.scheduled_at.dispatchEvent(new Event('change'));
    }));
    // Warn (never block) when a chosen cleaner already has a job at that time.
    const checkConflicts = async () => {
      const ids = $$('input[name=employee_ids]:checked', form).map((el) => el.value);
      const box = $('#conflicts', form);
      if (!ids.length || !form.scheduled_at.value) { box.classList.add('hidden'); return; }
      try {
        const list = await api(`/jobs/conflicts?employee_ids=${ids.join(',')}&scheduled_at=${encodeURIComponent(form.scheduled_at.value)}&duration_hours=${encodeURIComponent(form.duration_hours.value)}${existing ? `&job_id=${job.id}` : ''}`);
        box.innerHTML = list.map((w) => `⚠️ ${esc(w.message)}`).join('<br>');
        box.classList.toggle('hidden', !list.length);
      } catch { box.classList.add('hidden'); }
    };
    $$('input[name=employee_ids]', form).forEach((el) => el.addEventListener('change', checkConflicts));
    form.scheduled_at.addEventListener('change', checkConflicts);
    form.duration_hours.addEventListener('change', checkConflicts);
    checkConflicts();
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
      $('#job-invoice', form).onclick = () => { form.closest('.modal-backdrop').remove(); invoiceForm({ customer_id: job.customer_id, job_id: job.id }); };
    }
  }

  // ---------- calendar ----------
  // Day, week and month views. Tap an empty time to book it; drag a booking to move it (mouse);
  // tap a booking to open it. Colours follow the cleaner.
  const DAY_START = 7; // 7 AM
  const DAY_END = 20; // 8 PM
  const hiddenCleaners = new Set();
  async function calendarPage(params) {
    const phone = window.matchMedia('(max-width: 700px)').matches;
    const view = params.get('view') || (phone ? 'day' : 'week');
    const anchor = params.get('date') || params.get('week') || dayStr(new Date());
    const base = new Date(`${anchor}T00:00`);
    let start; let days;
    if (view === 'day') { start = base; days = 1; }
    else if (view === 'month') { start = new Date(base.getFullYear(), base.getMonth(), 1); start = addDays(start, -start.getDay()); days = 42; }
    else { start = addDays(base, -base.getDay()); days = 7; }
    const end = addDays(start, days);
    const [jobs, employees] = await Promise.all([api(`/jobs?from=${dayStr(start)}&to=${dayStr(end)}`), api('/employees')]);
    const visible = jobs.filter((j) => j.status !== 'cancelled' || view !== 'month')
      .filter((j) => !hiddenCleaners.size || !j.employees.length || j.employees.some((e) => !hiddenCleaners.has(e.id)));
    const step = view === 'day' ? 1 : view === 'week' ? 7 : null;
    const prev = step ? addDays(base, -step) : new Date(base.getFullYear(), base.getMonth() - 1, 1);
    const next = step ? addDays(base, step) : new Date(base.getFullYear(), base.getMonth() + 1, 1);
    const link = (v, d) => `#/calendar?view=${v}&date=${dayStr(d)}`;
    const today = dayStr(new Date());
    const title = view === 'day' ? base.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
      : view === 'month' ? base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${addDays(end, -1).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const active = employees.filter((e) => e.active);

    app.innerHTML = `
      <div class="cal-bar"><h1>Calendar</h1>
        <div class="seg">${[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([v, l]) => `<a href="${link(v, base)}" class="${v === view ? 'on' : ''}">${l}</a>`).join('')}</div>
        <div class="seg"><a href="${link(view, prev)}" aria-label="Previous">‹</a><a href="${link(view, new Date())}">Today</a><a href="${link(view, next)}" aria-label="Next">›</a></div>
        <button class="btn" id="add">＋ Book</button></div>
      <p class="cal-title">${esc(title)} · ${visible.filter((j) => j.status !== 'cancelled').length} booking${visible.length === 1 ? '' : 's'}</p>
      ${active.length ? `<div class="legend" aria-label="Show or hide cleaners">${active.map((e) => `<button type="button" data-cleaner="${e.id}" class="${hiddenCleaners.has(e.id) ? 'off' : ''}"><i style="background:${cleanerColor(e.id)[0]}"></i>${esc(e.name)}</button>`).join('')}</div>` : ''}
      <div id="cal"></div>`;
    $('#add').onclick = () => jobForm(view === 'day' ? { scheduled_at: `${dayStr(base)}T09:00` } : {});
    $$('[data-cleaner]').forEach((b) => (b.onclick = () => { const id = Number(b.dataset.cleaner); if (hiddenCleaners.has(id)) hiddenCleaners.delete(id); else hiddenCleaners.add(id); render(); }));

    const box = $('#cal');
    if (view === 'month') {
      box.innerHTML = `<div class="month">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="mh">${d}</div>`).join('')}
        ${[...Array(days)].map((_, i) => {
          const d = addDays(start, i); const ds = dayStr(d);
          const list = visible.filter((j) => j.scheduled_at.startsWith(ds) && j.status !== 'cancelled');
          return `<a href="${link('day', d)}" class="${d.getMonth() !== base.getMonth() ? 'other' : ''} ${ds === today ? 'today' : ''}"><span class="num">${d.getDate()}</span>
            ${list.slice(0, 3).map((j) => `<span class="mj" style="${jobColorVars(j)}">${esc(fmtTime(j.scheduled_at))} ${esc(j.customer ? j.customer.name.split(' ')[0] : '')}</span>`).join('')}
            ${list.length > 3 ? `<span class="more">+${list.length - 3} more</span>` : ''}${list.length ? `<span class="count">${list.length} job${list.length > 1 ? 's' : ''}</span>` : ''}</a>`;
        }).join('')}</div>`;
      return;
    }

    const dayList = [...Array(days)].map((_, i) => addDays(start, i));
    const hours = [...Array(DAY_END - DAY_START)].map((_, i) => DAY_START + i);
    const H = parseFloat(getComputedStyle(document.body).getPropertyValue('--hour')) || 56;
    const minsOf = (local) => Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
    const topFor = (local) => ((minsOf(local) - DAY_START * 60) / 60) * H;
    const hourLabel = (h) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' });
    box.innerHTML = `<div class="cal"><div class="cal-scroll" style="--days:${days}">
      <div class="cal-head"><div></div>${dayList.map((d) => { const ds = dayStr(d); return `<div class="${ds === today ? 'today' : ''}"><a href="${link('day', d)}">${esc(d.toLocaleDateString(undefined, { weekday: 'short' }))} <b>${d.getDate()}</b></a></div>`; }).join('')}</div>
      <div class="cal-body" style="height:${hours.length * H}px">
        <div class="cal-hours">${hours.map((h) => `<div>${h === DAY_START ? '' : esc(hourLabel(h))}</div>`).join('')}</div>
        ${dayList.map((d) => {
          const ds = dayStr(d);
          // Side-by-side columns for bookings that overlap.
          const list = visible.filter((j) => j.scheduled_at.startsWith(ds)).sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at));
          const lanes = [];
          const placed = list.map((j) => {
            const s0 = minsOf(j.scheduled_at); const e0 = s0 + (j.duration_hours || 3) * 60;
            let lane = lanes.findIndex((endM) => endM <= s0);
            if (lane < 0) { lane = lanes.length; lanes.push(e0); } else lanes[lane] = e0;
            return { j, lane };
          });
          const width = 100 / Math.max(1, lanes.length);
          return `<div class="cal-col ${ds < today ? 'past' : ''}" data-day="${ds}">
            ${ds === today ? `<div class="now-line" style="top:${topFor(localISO(new Date()))}px"></div>` : ''}
            ${placed.map(({ j, lane }) => {
              const top = Math.max(0, topFor(j.scheduled_at));
              const height = Math.max(26, (j.duration_hours || 3) * H - 3);
              return `<a href="#" draggable="false" class="ev2 ${j.employees.length ? '' : 'unassigned'} ${j.status}" data-ev="${j.id}" style="${jobColorVars(j)};top:${top}px;height:${height}px;left:calc(${lane * width}% + 3px);right:auto;width:calc(${width}% - 6px)">
                <span class="t">${esc(fmtTime(j.scheduled_at))}</span>${j.repeat ? ' 🔁' : ''}<strong>${esc(j.customer ? j.customer.name : '')}</strong>
                ${esc([j.service_type, j.employees.length ? j.employees.map((e) => e.name.split(' ')[0]).join(', ') : 'No cleaner yet'].filter(Boolean).join(' · '))}</a>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div></div></div>
      <p class="cal-hint">${phone ? 'Tap an empty time to book it. Tap a booking to change it.' : 'Click an empty time to book it. Drag a booking to move it. Click a booking to change it.'}</p>`;
    // Start the view at 8 AM-ish on short screens; the grid starts at 7 AM.
    const slotAt = (col, clientY) => {
      const r = col.getBoundingClientRect();
      const mins = DAY_START * 60 + Math.round(((clientY - r.top) / H) * 60 / 30) * 30;
      const clamped = Math.max(DAY_START * 60, Math.min(DAY_END * 60 - 30, mins));
      return `${col.dataset.day}T${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
    };
    $$('.cal-col', box).forEach((col) => col.addEventListener('click', (e) => {
      if (e.target.closest('.ev2')) return;
      jobForm({ scheduled_at: slotAt(col, e.clientY) });
    }));
    $$('.ev2', box).forEach((el) => {
      const job = jobs.find((j) => String(j.id) === el.dataset.ev);
      let drag = null;
      el.addEventListener('click', (e) => { e.preventDefault(); if (el.dataset.dragged) { delete el.dataset.dragged; return; } api(`/jobs/${job.id}`).then(jobForm).catch((err) => toast(err.message, true)); });
      el.addEventListener('dragstart', (e) => e.preventDefault());
      el.addEventListener('pointercancel', () => { drag = null; el.classList.remove('dragging'); el.style.transform = ''; });
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0 || job.status !== 'scheduled') return;
        const r = el.getBoundingClientRect();
        drag = { x: e.clientX, y: e.clientY, offset: e.clientY - r.top, moved: false };
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 6) return;
        drag.moved = true;
        el.classList.add('dragging');
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        $$('.cal-col', box).forEach((c) => c.classList.remove('drop'));
        const under = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList && n.classList.contains('cal-col'));
        if (under) under.classList.add('drop');
      });
      el.addEventListener('pointerup', async (e) => {
        if (!drag) return;
        const d = drag; drag = null;
        el.classList.remove('dragging');
        $$('.cal-col', box).forEach((c) => c.classList.remove('drop'));
        if (!d.moved) return;
        el.dataset.dragged = '1';
        const under = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList && n.classList.contains('cal-col'));
        if (!under) { el.style.transform = ''; return; }
        const when = slotAt(under, e.clientY - d.offset + 2);
        if (when === job.scheduled_at) { el.style.transform = ''; return; }
        moveJob(job, when, () => { el.style.transform = ''; });
      });
    });
    const scroller = $('.cal-scroll', box);
    if (scroller && phone) scroller.scrollLeft = 0;
  }

  // Confirm a drag-and-drop move, then save it (and email the client if ticked).
  function moveJob(job, when, onCancel) {
    const name = job.customer ? job.customer.name : 'this booking';
    const wrap = modal('Move booking', `
      <p style="margin:0 0 12px">Move <strong>${esc(name)}</strong> from ${esc(fmtWhen(job.scheduled_at))} to <strong>${esc(fmtWhen(when))}</strong>?</p>
      ${checkbox('notify_customer', job.customer && job.customer.email ? `Email ${job.customer.email} the new time` : 'Email the client the new time (no email address on file)', Boolean(job.customer && job.customer.email))}
      ${job.employees.length ? checkbox('notify_employees', `Tell ${job.employees.map((e) => e.name.split(' ')[0]).join(', ')} about the change`, true) : ''}`,
    async (data) => {
      const saved = await api(`/jobs/${job.id}`, { method: 'PUT', body: { ...job, scheduled_at: when, employee_ids: job.employees.map((e) => e.id), notify_customer: data.notify_customer, notify_employees: false } });
      if (data.notify_employees && job.employees.length) await api(`/jobs/${job.id}/notify-cleaners`, { method: 'POST', body: {} }).catch(() => {});
      const cn = saved.customer_notification;
      toast(cn ? (cn.ok || cn.retrying ? `Moved. ${name.split(' ')[0]} was emailed the new time ✅` : `Moved, but the email didn't send: ${cn.error}`) : 'Moved ✅', Boolean(cn && !cn.ok && !cn.retrying));
      if (saved.warnings && saved.warnings.length) toast(`Heads up: ${saved.warnings.map((w) => w.message).join(' ')}`, true);
      render();
    }, { submitLabel: 'Move booking' });
    $$('[data-close]', wrap.closest('.modal-backdrop')).forEach((b) => b.addEventListener('click', onCancel));
  }

  async function alertsPage() {
    const [s, log] = await Promise.all([api('/stats'), api('/notifications')]);
    const a = s.alerts;
    const row = (ok, text) => `<div>${ok ? '✅' : '❌'} ${text}</div>`;
    app.innerHTML = `
      <h1>Alerts</h1>
      <div class="card">
        <h2>How you get notified about new leads</h2>
        ${row(a.email_configured, a.email_service ? `Email sending (through ${esc(a.email_service)})` : 'Email sending')}
        ${row(a.alert_emails > 0, `Alert email address(es): ${a.alert_emails}`)}
        ${a.sms_configured ? row(a.alert_phones > 0, `Alert phone number(s): ${a.alert_phones}`) : `<div>📱 Texting uses Google Voice <strong>${esc(a.google_voice_number)}</strong>. New-lead alerts come by email, so turn on Gmail notifications on your phone to see them instantly.</div>`}
        <h3 style="margin-top:16px">Website chat</h3>
        ${row(META.chat.aiEnabled, META.chat.aiEnabled ? 'AI assistant (ANTHROPIC_API_KEY)' : 'AI assistant is OFF: the chat answers with ready-made replies only (set ANTHROPIC_API_KEY)')}
        ${META.chat.verification === 'codes' ? `
        ${row(!META.chat.phoneVerification || META.chat.phoneVerificationReady, META.chat.phoneVerification ? 'Phone verification (Firebase)' : 'Phone verification is OFF (testing only)')}
        ${row(a.email_configured, 'Email verification codes (SMTP)')}` : '<div>💬 Customers start chatting after typing their name, email and phone (no codes).</div>'}
        <p class="muted small">These are set in the server's environment settings (see README). Every lead is saved in the Leads page even if an alert fails.</p>
        <button class="btn" id="test">Send test alert</button>
      </div>
      <div class="card">
        <h2>Recent notifications</h2>
        <p class="muted small">Every email and text is listed here. A failed one is tried again automatically (3 tries in total); press Retry to send it once more.</p>
        <div class="list">${log.length ? log.map(notificationItem).join('') : '<div class="empty">Nothing sent yet</div>'}</div>
      </div>`;
    bindRetry();
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
    // Line items. A booking's invoice starts with its service line and exactly one travel fee line.
    let items = existing ? inv.items.map((it) => ({ ...it })) : [];
    if (!existing && inv.job_id) items = (await api(`/invoices/prefill?job_id=${inv.job_id}`)).items;
    const travel = { description: `${META.pricing.travelFeeLabel} — $${META.pricing.travelFee}`, amount: META.pricing.travelFee, kind: 'travel' };
    const form = modal(existing ? `Invoice ${inv.number}` : 'New invoice', `<div class="form-grid">
      ${existing ? `<div class="field full"><label>Client</label><div>${esc(inv.customer.name)} <span class="muted small">${esc(inv.customer.email || 'no email on file')}</span></div></div>`
        : select('customer_id', 'Client *', [['', '— Choose client —'], ...customers.map((c) => [c.id, `${c.name}${c.email ? ` · ${c.email}` : ''}`])], inv.customer_id, { full: true })}
      <div class="field full"><label for="f-job_id">Job</label><select id="f-job_id" name="job_id">${jobSelect(jobs, inv.job_id)}</select></div>
      <div class="field full"><label>Lines *</label><div id="items"></div>
        <div class="row" style="margin-top:6px"><button type="button" class="btn sm secondary" id="add-item">+ Line</button><button type="button" class="btn sm secondary" id="add-travel">+ Travel Fee — $${esc(META.pricing.travelFee)}</button>
        <span style="flex:1"></span><strong id="items-total"></strong></div>
        <div class="muted small">The total is the sum of the lines. The travel fee is charged once per visit.</div></div>
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
      </div><div class="muted small" style="margin-top:6px">${inv.sent_at ? `Sent ${esc(fmtAgo(inv.sent_at))}. ` : ''}${inv.paid_at ? `Paid ${esc(fmtAgo(inv.paid_at))}. ` : ''}The email lists every line, the total, the due date, the Pay link and a link to view the invoice in the client portal.</div></div>` : ''}
      </div>`, async (data) => {
      if (data.job_id === '') data.job_id = null;
      data.items = readItems();
      if (existing) await api(`/invoices/${inv.id}`, { method: 'PUT', body: data });
      else await api('/invoices', { method: 'POST', body: data });
      toast(existing ? 'Invoice saved' : 'Invoice created');
      render();
    }, { submitLabel: existing ? 'Save' : 'Create invoice', danger: existing ? { label: 'Delete', confirm: 'Delete this invoice? (Tip: use Void to keep a record.)', action: async () => { await api(`/invoices/${inv.id}`, { method: 'DELETE' }); render(); } } : null });

    const box = $('#items', form);
    const isTravel = (it) => it.kind === 'travel';
    function readItems() {
      return $$('.item-row', box).map((row, i) => ({ ...items[i], description: $('[data-desc]', row).value, amount: Number($('[data-amt]', row).value || 0) }));
    }
    function drawItems() {
      box.innerHTML = items.map((it, i) => `<div class="item-row">
          <input data-desc value="${esc(it.description)}" placeholder="Description" ${isTravel(it) ? 'readonly' : ''}>
          <input data-amt type="number" step="0.01" value="${esc(it.amount)}" ${isTravel(it) ? 'readonly' : ''}>
          <button type="button" class="btn sm secondary" data-del-item="${i}" title="Remove line">✕</button></div>`).join('') || '<div class="muted small">No lines yet.</div>';
      $$('[data-del-item]', box).forEach((b) => (b.onclick = () => { items = readItems(); items.splice(Number(b.dataset.delItem), 1); drawItems(); }));
      $$('input', box).forEach((el) => (el.oninput = sumUp));
      $('#add-travel', form).disabled = items.some(isTravel);
      sumUp();
    }
    function sumUp() {
      const total = readItems().reduce((s, it) => s + (Number(it.amount) || 0), 0);
      $('#items-total', form).textContent = `Total ${moneyCents(total)}`;
    }
    $('#add-item', form).onclick = () => { items = readItems(); items.push({ description: '', amount: 0, kind: 'other' }); drawItems(); };
    $('#add-travel', form).onclick = () => { items = readItems(); if (!items.some(isTravel)) items.push({ ...travel }); drawItems(); };
    drawItems();

    // Picking a job fills in its lines (service + one travel fee line) when the invoice has none yet.
    let current = jobs;
    form.job_id.onchange = async () => {
      if (!form.job_id.value || readItems().some((it) => it.description)) return;
      try { items = (await api(`/invoices/prefill?job_id=${form.job_id.value}`)).items; drawItems(); } catch (err) { toast(err.message, true); }
    };
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
        data.items = readItems();
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

  // ---------- website forms (event quotes, careers, gift cards, referrals, local quotes) ----------
  async function formsPage(params) {
    const st = params.get('status') || 'all';
    const list = await api(`/forms?status=${encodeURIComponent(st)}`);
    app.innerHTML = `
      <h1>Website forms</h1>
      <p class="muted small">Event quotes, job applications, gift card orders, referrals and local area quotes sent from the website. Estimate requests and contact messages are in <a href="#/leads">Leads</a>.</p>
      <div class="tabs">${[['all', 'All'], ['unread', 'Unread'], ['read', 'Read']].map(([v, l]) => `<button data-st="${v}" class="${v === st ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="list">${list.length ? list.map((f) => `<a class="item" href="#" data-form="${f.id}">
        <div class="main"><div class="title">${f.read_at ? '' : '🔵 '}${esc(f.form)}${f.name ? ` · ${esc(f.name)}` : ''}</div>
        <div class="sub">${esc([fmtPhone(f.phone), f.email, Object.entries(f.fields).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(' · ').slice(0, 120)].filter(Boolean).join(' · '))}</div></div>
        <div style="text-align:right">${status(f.read_at ? 'read' : 'unread')}<div class="sub small">${esc(fmtAgo(f.created_at))}</div></div></a>`).join('') : '<div class="empty">No forms here</div>'}</div>`;
    $$('.tabs button').forEach((b) => (b.onclick = () => { location.hash = `#/forms?status=${b.dataset.st}`; }));
    $$('[data-form]').forEach((a) => (a.onclick = async (e) => {
      e.preventDefault();
      try { formDetail(await api(`/forms/${a.dataset.form}`)); } catch (err) { toast(err.message, true); }
    }));
  }

  async function formDetail(f) {
    // Opening it marks it read.
    if (!f.read_at) { try { f = { ...f, ...(await api(`/forms/${f.id}`, { method: 'PATCH', body: { read: true } })) }; refreshBadge(); } catch { /* still show it */ } }
    const form = modal(`${f.form}${f.name ? ` · ${f.name}` : ''}`, `<dl class="kv">
        <dt>Received</dt><dd>${esc(utcDate(f.created_at).toLocaleString())}</dd>
        ${f.name ? `<dt>Name</dt><dd>${esc(f.name)}</dd>` : ''}
        <dt>Phone</dt><dd>${esc(fmtPhone(f.phone)) || '—'}</dd>
        <dt>Email</dt><dd>${esc(f.email) || '—'}</dd>
        ${f.preferred_contact ? `<dt>Contact by</dt><dd>${esc(f.preferred_contact)}</dd>` : ''}
        ${Object.entries(f.fields).map(([k, v]) => `<dt>${esc(k)}</dt><dd style="white-space:pre-wrap">${esc(v)}</dd>`).join('')}
      </dl>
      <div style="margin-top:12px">${contactLinks(f)}</div>
      ${f.notifications && f.notifications.length ? `<h3>Alerts</h3><div class="list">${f.notifications.map(notificationItem).join('')}</div>` : ''}`, async () => {
      await api(`/forms/${f.id}`, { method: 'PATCH', body: { read: false } });
      toast('Marked unread');
      render();
    }, { submitLabel: 'Mark unread', danger: { label: 'Delete', confirm: 'Delete this form submission?', action: async () => { await api(`/forms/${f.id}`, { method: 'DELETE' }); render(); } } });
    $$('[data-close]', form.parentElement).forEach((b) => b.addEventListener('click', () => render()));
    bindRetry();
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
    document.body.classList.remove('logged-out');
    render();
  }

  // "← Back" returns to wherever you came from (Today, Calendar, a list); opened from a link, it goes to the list.
  let inAppNavs = 0;
  window.addEventListener('hashchange', () => { inAppNavs += 1; if (META) render(); });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a.back');
    if (a && inAppNavs > 0 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); history.back(); }
  });
  // Re-check for new leads and chat messages while the page is open.
  setInterval(() => { if (META && !document.hidden) refreshBadge(); }, 15000);
  start();
})();

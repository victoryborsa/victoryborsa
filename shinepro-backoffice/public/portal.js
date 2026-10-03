/* PGH Shine Pro Cleaning Services — client portal (/portal) and host portal (/host).
   Plain JavaScript, no build step. The screen is chosen from the URL. */
(() => {
  const BUSINESS = 'PGH Shine Pro Cleaning Services';
  const PHONE = '(412) 447-8047';
  const PHONE_LINK = 'tel:+14124478047';
  const EMAIL = 'pghshinepro@gmail.com';
  const SERVICES = ['Standard House Cleaning', 'Deep Cleaning', 'Move-In / Move-Out Cleaning', 'Airbnb / STR Turnover', 'Apartment & Condo Cleaning', 'Event Cleanup'];
  const FREQUENCIES = ['One time', 'Weekly', 'Every 2 weeks', 'Monthly'];

  const app = document.getElementById('app');
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const ADMIN_PRINT = /^\/admin\/invoices\/\d+$/.test(pathname);
  const MODE = pathname.startsWith('/host') ? 'host' : 'portal';
  const BASE = `/${MODE}`;
  const sub = ADMIN_PRINT ? 'admin-invoice' : pathname.slice(BASE.length).replace(/^\//, ''); // "", "bookings", "invoices/12"...
  let SESSION = null;

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${ADMIN_PRINT ? '/api/admin' : '/api/portal'}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    if (res.status === 401 && !['/login', '/session', '/set-password'].includes(path)) {
      if (ADMIN_PRINT) location.href = '/admin';
      else location.href = `${BASE}/login?next=${encodeURIComponent(location.pathname)}`;
      throw new Error('Please log in');
    }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || `Something went wrong (${res.status}). Call us at ${PHONE}.`), { status: res.status, data });
    return data;
  }

  function toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = `toast${isError ? ' error' : ''}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), isError ? 6000 : 3500);
  }

  const fmtPhone = (p) => { const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p || ''); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (p || ''); };
  const utcDate = (s) => (s ? new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`) : null); // DB timestamps are UTC
  const fmtWhen = (local) => new Date(local).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fmtDay = (local) => new Date(local).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const fmtTime = (local) => new Date(local).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const fmtDate = (ymd) => (ymd ? new Date(`${ymd}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const fmtClock = (hhmm) => (hhmm ? new Date(`2000-01-01T${hhmm}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
  const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const status = (s, label) => `<span class="status st-${esc(s)}">${esc(label || s)}</span>`;
  const localISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const safeUrl = (u) => (/^https:\/\//i.test(u || '') ? u : '');

  function formData(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    return out;
  }

  function modal(title, innerHtml, onSubmit, { submitLabel = 'Send request' } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<form class="modal" novalidate>
      <div class="row between"><h2>${esc(title)}</h2><button type="button" class="btn sm secondary" data-close aria-label="Close">✕</button></div>
      ${innerHtml}
      <div class="actions"><button type="button" class="btn secondary" data-close>Cancel</button><button type="submit" class="btn">${esc(submitLabel)}</button></div></form>`;
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
    document.body.appendChild(wrap);
    const first = $('input:not([type=hidden]):not([type=checkbox]), textarea, select', form);
    if (first) first.focus();
    return form;
  }

  const input = (name, label, value = '', { type = 'text', full = false, attrs = '' } = {}) =>
    `<div class="field ${full ? 'full' : ''}"><label for="f-${name}">${esc(label)}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value ?? '')}" ${attrs}></div>`;
  const textarea = (name, label, value = '', { placeholder = '' } = {}) =>
    `<div class="field full"><label for="f-${name}">${esc(label)}</label><textarea id="f-${name}" name="${name}" placeholder="${esc(placeholder)}">${esc(value ?? '')}</textarea></div>`;
  const select = (name, label, options, value, { full = false } = {}) =>
    `<div class="field ${full ? 'full' : ''}"><label for="f-${name}">${esc(label)}</label><select id="f-${name}" name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  const checkbox = (name, label, checked) =>
    `<div class="field full"><label class="check"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> ${esc(label)}</label></div>`;

  const helpLine = `<p class="muted small help-line">Need help? Call or text <a href="${PHONE_LINK}">${PHONE}</a> or email <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>`;

  // ---------- layout ----------
  function chrome() {
    const brand = $('#brand');
    brand.href = ADMIN_PRINT ? '/admin' : BASE;
    const pill = $('#portal-pill');
    const nav = $('#nav');
    if (ADMIN_PRINT) {
      pill.textContent = '🛡 Admin';
      pill.classList.remove('hidden');
      nav.innerHTML = '<a href="/admin#/invoices">← Back to invoices</a>';
      nav.classList.remove('hidden');
      return;
    }
    pill.textContent = MODE === 'host' ? '🏠 Host portal' : '👤 Client portal';
    pill.classList.remove('hidden');
    if (!SESSION || !SESSION.loggedIn) return;
    const links = MODE === 'host'
      ? [['', 'Home'], ['turnovers', 'Turnovers'], ['properties', 'Properties'], ['invoices', 'Invoices'], ['profile', 'Profile']]
      : [['', 'Home'], ['bookings', 'Bookings'], ['invoices', 'Invoices'], ['profile', 'Profile']];
    const section = sub.split('/')[0];
    nav.innerHTML = links.map(([p, l]) => `<a href="${BASE}${p ? `/${p}` : ''}" class="${section === p ? 'active' : ''}">${l}</a>`).join('')
      + (MODE === 'host' ? '<a href="/portal/bookings">All bookings</a>' : SESSION.is_host ? '<a href="/host">Host portal</a>' : '')
      + '<a href="#" id="logout">Log out</a>';
    nav.classList.remove('hidden');
    $('#logout').onclick = async (e) => {
      e.preventDefault();
      await api('/logout', { method: 'POST', body: {} }).catch(() => {});
      location.href = `${BASE}/login`;
    };
  }

  // ---------- public screens (no login) ----------
  function authCard(inner) {
    app.innerHTML = `<div class="login-wrap"><div class="card login">
      <div class="row" style="margin-bottom:6px"><span class="brand-mark">S</span><strong>${BUSINESS}</strong></div>
      <p class="muted small" style="margin-top:0">${MODE === 'host' ? 'Host portal for Airbnb & short-term rental owners' : 'Client portal'}</p>
      ${inner}</div></div>`;
  }

  function loginPage() {
    const next = new URLSearchParams(location.search).get('next');
    authCard(`<form id="login-form">
        <h1 class="auth-title">Log in</h1>
        ${input('email', 'Email', '', { type: 'email', attrs: 'autocomplete="email" required' })}
        ${input('password', 'Password', '', { type: 'password', attrs: 'autocomplete="current-password" required' })}
        <button class="btn block" type="submit">Log in</button>
      </form>
      <p class="small" style="margin-top:14px"><a href="${BASE}/forgot">Forgot your password?</a></p>
      <p class="small">First time here? <a href="${BASE}/register">Set up your account</a></p>
      ${helpLine}`);
    $('#login-form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('button', e.target);
      btn.disabled = true;
      try {
        const r = await api('/login', { method: 'POST', body: { email: e.target.email.value, password: e.target.password.value } });
        const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : BASE;
        location.href = MODE === 'host' && !r.is_host ? '/portal' : dest;
      } catch (err) { toast(err.message, true); btn.disabled = false; }
    };
  }

  function emailLinkPage(kind) {
    const isRegister = kind === 'register';
    authCard(`<form id="link-form">
        <h1 class="auth-title">${isRegister ? 'Set up your account' : 'Reset your password'}</h1>
        <p class="muted small">${isRegister
          ? 'Enter the email address you gave us when you booked. We will email you a link to choose your password.'
          : 'Enter your email and we will send you a link to choose a new password.'}</p>
        ${input('email', 'Email', '', { type: 'email', attrs: 'autocomplete="email" required' })}
        <button class="btn block" type="submit">Email me a link</button>
      </form>
      <div id="link-done" class="banner ok hidden" style="margin-top:14px"></div>
      <p class="small" style="margin-top:14px"><a href="${BASE}/login">← Back to log in</a></p>
      ${isRegister ? `<p class="muted small">Not a client yet? <a href="https://pghshinepro.com/free-estimate">Get a free estimate</a>.</p>` : ''}
      ${helpLine}`);
    $('#link-form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('button', e.target);
      btn.disabled = true;
      try {
        const r = await api(isRegister ? '/register' : '/forgot', { method: 'POST', body: { email: e.target.email.value } });
        const done = $('#link-done');
        done.textContent = r.message;
        done.classList.remove('hidden');
      } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
    };
  }

  async function setPasswordPage() {
    const token = new URLSearchParams(location.search).get('token') || '';
    let info;
    try { info = await api(`/password-link?token=${encodeURIComponent(token)}`); } catch (err) {
      authCard(`<h1 class="auth-title">Link expired</h1><div class="banner warn">${esc(err.message)}</div>
        <a class="btn block" href="${BASE}/forgot">Email me a new link</a>${helpLine}`);
      return;
    }
    authCard(`<form id="pw-form">
        <h1 class="auth-title">${info.purpose === 'reset' ? 'Choose a new password' : 'Welcome! Choose your password'}</h1>
        <p class="muted small">Your login email is <strong>${esc(info.email)}</strong>.</p>
        ${input('password', 'New password (8+ characters)', '', { type: 'password', attrs: 'autocomplete="new-password" minlength="8" required' })}
        ${input('confirm', 'Type it again', '', { type: 'password', attrs: 'autocomplete="new-password" required' })}
        <button class="btn block" type="submit">Save password & log in</button>
      </form>${helpLine}`);
    $('#pw-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.password.value !== f.confirm.value) return toast("The two passwords don't match", true);
      const btn = $('button', f);
      btn.disabled = true;
      try {
        const r = await api('/set-password', { method: 'POST', body: { token, password: f.password.value } });
        location.href = r.is_host ? '/host' : '/portal';
      } catch (err) { toast(err.message, true); btn.disabled = false; }
    };
  }

  // ---------- shared pieces ----------
  const cleanersText = (j) => (j.cleaners.length ? `Your cleaner${j.cleaners.length > 1 ? 's' : ''}: ${j.cleaners.join(', ')}` : 'Cleaner to be assigned');
  const requestLabel = (r) => ({ reschedule: 'Reschedule requested', cancel: 'Cancellation requested', turnover: 'Turnover requested' })[r.kind];

  function bookingCard(j, { actions = false } = {}) {
    return `<div class="item booking">
      <div class="date-badge"><span class="m">${esc(new Date(j.scheduled_at).toLocaleDateString(undefined, { month: 'short' }))}</span><span class="d">${new Date(j.scheduled_at).getDate()}</span></div>
      <div class="main">
        <div class="inline-status">${status(j.status)}</div>
        <div class="title">${esc(fmtWhen(j.scheduled_at))}</div>
        <div class="sub">${esc([j.property && j.property.name, j.service_type].filter(Boolean).join(' · ') || 'Cleaning')}</div>
        ${j.address ? `<div class="sub">📍 ${esc(j.address)}</div>` : ''}
        <div class="sub">🧹 ${esc(cleanersText(j))}</div>
        ${j.pending_request ? `<div class="sub"><span class="status st-new">⏳ ${esc(requestLabel(j.pending_request))}</span></div>` : ''}
        ${actions && !j.pending_request ? `<div class="row" style="margin-top:8px">
          <button class="btn sm secondary" data-resched="${j.id}">Reschedule</button>
          <button class="btn sm danger" data-cancel="${j.id}">Cancel</button></div>` : ''}
        ${j.has_report && MODE === 'host' ? `<div style="margin-top:8px"><a class="btn sm secondary" href="/host/turnovers/${j.id}">View report</a></div>` : ''}
      </div>
      <div class="right">${status(j.status)}</div>
    </div>`;
  }

  function requestItem(r) {
    const what = r.kind === 'turnover'
      ? `${r.property ? r.property.name : 'Property'} · ${fmtDate(r.requested_at)}${r.checkout_time ? ` · checkout ${fmtClock(r.checkout_time)}` : ''}${r.checkin_time ? ` · next check-in ${fmtClock(r.checkin_time)}` : ''}`
      : r.kind === 'reschedule' ? `${r.job ? fmtWhen(r.job.scheduled_at) : ''} → ${fmtWhen(r.requested_at)}` : (r.job ? fmtWhen(r.job.scheduled_at) : '');
    return `<div class="item"><div class="main"><div class="title">${esc(requestLabel(r).replace(' requested', ''))}</div>
      <div class="sub">${esc(what)}</div>
      ${r.note ? `<div class="sub">Your note: ${esc(r.note)}</div>` : ''}
      ${r.admin_note ? `<div class="sub"><strong>Our reply:</strong> ${esc(r.admin_note)}</div>` : ''}</div>
      <div class="right">${status(r.status === 'pending' ? 'new' : r.status === 'approved' ? 'booked' : 'cancelled', r.status)}</div></div>`;
  }

  function newCleaningForm(profile) {
    modal('Request a cleaning', `<div class="form-grid">
      ${select('service_type', 'Service', SERVICES.map((s) => [s, s]), SERVICES[0], { full: true })}
      ${select('frequency', 'How often', FREQUENCIES.map((s) => [s, s]), FREQUENCIES[0])}
      ${input('preferred_date', 'Preferred date', '', { type: 'date', attrs: `min="${localISO(new Date()).slice(0, 10)}"` })}
      ${input('address', 'Address', [profile.address, profile.city].filter(Boolean).join(', '), { full: true })}
      ${textarea('message', 'Anything we should know?', '', { placeholder: 'Rooms, pets, add-ons like inside the fridge or oven…' })}
      </div><p class="muted small">We will confirm the price and time with you before booking.</p>`, async (data) => {
      await api('/bookings/new', { method: 'POST', body: data });
      toast("Thanks! We got your request and will contact you shortly.");
    });
  }

  // ---------- client: dashboard ----------
  async function dashboard() {
    const d = await api('/dashboard');
    const first = (d.name || '').split(' ')[0];
    if (MODE === 'host') return hostDashboard(d, first);
    const n = d.next_job;
    app.innerHTML = `
      <h1>Hi${first ? `, ${esc(first)}` : ''}!</h1>
      <div class="grid-2">
        <div class="card hero-card">
          <div class="muted small label">Your next cleaning</div>
          ${n ? `<div class="big">${esc(fmtDay(n.scheduled_at))}</div>
            <div class="mid">${esc(fmtTime(n.scheduled_at))}${n.service_type ? ` · ${esc(n.service_type)}` : ''}</div>
            ${n.address ? `<div class="muted">📍 ${esc(n.address)}</div>` : ''}
            <div class="muted">🧹 ${esc(cleanersText(n))}</div>
            ${n.pending_request ? `<div style="margin-top:8px"><span class="status st-new">⏳ ${esc(requestLabel(n.pending_request))}</span></div>` : ''}
            <div class="row" style="margin-top:14px"><a class="btn sm secondary" href="/portal/bookings">Manage bookings</a></div>`
            : `<div class="big">Nothing booked yet</div><p class="muted">Ready for a sparkling home? Request a cleaning and we will get back to you fast.</p>`}
        </div>
        <div class="card hero-card">
          <div class="muted small label">Open invoices</div>
          <div class="big">${money(d.open_invoices.total)}</div>
          <div class="muted">${d.open_invoices.count ? `${d.open_invoices.count} invoice${d.open_invoices.count === 1 ? '' : 's'} to pay` : 'You are all paid up. Thank you!'}</div>
          <div class="row" style="margin-top:14px"><a class="btn sm secondary" href="/portal/invoices">See invoices</a></div>
        </div>
      </div>
      ${d.pending_requests ? `<div class="banner warn">⏳ You have ${d.pending_requests} request${d.pending_requests === 1 ? '' : 's'} waiting for our reply. We usually answer the same day.</div>` : ''}
      <div class="tiles">
        <a class="tile" href="#" id="new-cleaning"><span class="icon i-teal">✨</span><span><div class="t">Request a cleaning</div><div class="d">Book your next visit</div></span><span class="chev">›</span></a>
        <a class="tile" href="/portal/bookings"><span class="icon i-blue">📅</span><span><div class="t">My bookings</div><div class="d">${d.upcoming_count} upcoming</div></span><span class="chev">›</span></a>
        <a class="tile" href="/portal/invoices"><span class="icon i-gold">🧾</span><span><div class="t">Invoices</div><div class="d">View, print & pay</div></span><span class="chev">›</span></a>
        <a class="tile" href="/portal/profile"><span class="icon i-green">👤</span><span><div class="t">My profile</div><div class="d">Address, phone, password</div></span><span class="chev">›</span></a>
        ${d.is_host ? `<a class="tile" href="/host"><span class="icon i-purple">🏠</span><span><div class="t">Host portal</div><div class="d">Properties & turnovers</div></span><span class="chev">›</span></a>` : ''}
        <a class="tile" href="${PHONE_LINK}"><span class="icon i-cyan">📞</span><span><div class="t">Call or text us</div><div class="d">${PHONE}</div></span><span class="chev">›</span></a>
      </div>`;
    $('#new-cleaning').onclick = async (e) => { e.preventDefault(); newCleaningForm(await api('/profile')); };
  }

  function hostDashboard(d, first) {
    const n = d.next_turnover;
    app.innerHTML = `
      <h1>Hi${first ? `, ${esc(first)}` : ''}!</h1>
      <div class="grid-2">
        <div class="card hero-card">
          <div class="muted small label">Next turnover</div>
          ${n ? `<div class="big">${esc(fmtDay(n.scheduled_at))}</div>
            <div class="mid">${esc(fmtTime(n.scheduled_at))}${n.property ? ` · ${esc(n.property.name)}` : ''}</div>
            <div class="muted">🧹 ${esc(cleanersText(n))}</div>
            <div class="row" style="margin-top:14px"><a class="btn sm secondary" href="/host/turnovers">All turnovers</a></div>`
            : `<div class="big">No turnovers booked</div><p class="muted">Add your guest checkout dates and we will handle the rest.</p>`}
        </div>
        <div class="card hero-card">
          <div class="muted small label">Open invoices</div>
          <div class="big">${money(d.open_invoices.total)}</div>
          <div class="muted">${d.open_invoices.count ? `${d.open_invoices.count} invoice${d.open_invoices.count === 1 ? '' : 's'} to pay` : 'You are all paid up. Thank you!'}</div>
          <div class="row" style="margin-top:14px"><a class="btn sm secondary" href="/host/invoices">See invoices</a></div>
        </div>
      </div>
      ${d.pending_requests ? `<div class="banner warn">⏳ You have ${d.pending_requests} request${d.pending_requests === 1 ? '' : 's'} waiting for our reply.</div>` : ''}
      <div class="tiles">
        <a class="tile" href="/host/turnovers?request=1"><span class="icon i-teal">🔁</span><span><div class="t">Request a turnover</div><div class="d">Checkout date & times</div></span><span class="chev">›</span></a>
        <a class="tile" href="/host/turnovers"><span class="icon i-blue">📅</span><span><div class="t">Turnovers</div><div class="d">${d.upcoming_turnovers} upcoming · reports</div></span><span class="chev">›</span></a>
        <a class="tile" href="/host/properties"><span class="icon i-purple">🏠</span><span><div class="t">Properties</div><div class="d">${d.properties} propert${d.properties === 1 ? 'y' : 'ies'}</div></span><span class="chev">›</span></a>
        <a class="tile" href="/host/invoices"><span class="icon i-gold">🧾</span><span><div class="t">Invoices</div><div class="d">View, print & pay</div></span><span class="chev">›</span></a>
        <a class="tile" href="/host/profile"><span class="icon i-green">👤</span><span><div class="t">Profile</div><div class="d">Contact info, password</div></span><span class="chev">›</span></a>
        <a class="tile" href="${PHONE_LINK}"><span class="icon i-cyan">📞</span><span><div class="t">Call or text us</div><div class="d">${PHONE}</div></span><span class="chev">›</span></a>
      </div>`;
  }

  // ---------- client: bookings ----------
  async function bookingsPage() {
    const [b, profile] = await Promise.all([api('/bookings'), api('/profile')]);
    const view = new URLSearchParams(location.search).get('view') || 'upcoming';
    const list = view === 'past' ? b.past : b.upcoming;
    app.innerHTML = `
      <div class="row between"><h1>My bookings</h1><button class="btn" id="new">+ Request a cleaning</button></div>
      <div class="tabs"><button data-v="upcoming" class="${view === 'upcoming' ? 'active' : ''}">Upcoming (${b.upcoming.length})</button><button data-v="past" class="${view === 'past' ? 'active' : ''}">Past (${b.past.length})</button></div>
      <div class="list">${list.length ? list.map((j) => bookingCard(j, { actions: view === 'upcoming' })).join('')
        : `<div class="empty">${view === 'upcoming' ? 'No upcoming cleanings. Tap “Request a cleaning” to book one.' : 'No past cleanings yet.'}</div>`}</div>
      ${b.requests.length ? `<h2 style="margin-top:28px">Your requests</h2><div class="list">${b.requests.map(requestItem).join('')}</div>` : ''}
      ${helpLine}`;
    $$('.tabs button').forEach((btn) => (btn.onclick = () => { location.search = `?view=${btn.dataset.v}`; }));
    $('#new').onclick = () => newCleaningForm(profile);
    const byId = (id) => b.upcoming.find((j) => String(j.id) === id);
    $$('[data-resched]').forEach((btn) => (btn.onclick = () => {
      const j = byId(btn.dataset.resched);
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
      modal('Reschedule cleaning', `<p class="muted">Now booked: <strong>${esc(fmtWhen(j.scheduled_at))}</strong></p>
        ${input('scheduled_at', 'New date & time you would like', localISO(tomorrow), { type: 'datetime-local', attrs: `min="${localISO(new Date())}"` })}
        ${textarea('note', 'Note (optional)', '', { placeholder: 'Any time that day works, mornings are best…' })}
        <p class="muted small">This is a request. We will confirm the new time by email.</p>`, async (data) => {
        await api(`/bookings/${j.id}/reschedule`, { method: 'POST', body: data });
        toast('Request sent. We will confirm by email.');
        bookingsPage();
      });
    }));
    $$('[data-cancel]').forEach((btn) => (btn.onclick = () => {
      const j = byId(btn.dataset.cancel);
      modal('Cancel cleaning', `<p>Ask us to cancel your cleaning on <strong>${esc(fmtWhen(j.scheduled_at))}</strong>?</p>
        ${textarea('note', 'Reason (optional)', '')}
        <p class="muted small">We will confirm by email. For same-day changes please call ${PHONE}.</p>`, async (data) => {
        await api(`/bookings/${j.id}/cancel`, { method: 'POST', body: data });
        toast('Cancellation request sent.');
        bookingsPage();
      }, { submitLabel: 'Request cancellation' });
    }));
  }

  // ---------- invoices ----------
  function invoiceStatus(inv) {
    if (inv.status === 'sent') return inv.overdue ? status('failed', 'overdue') : status('new', 'due');
    return status(inv.status === 'paid' ? 'booked' : 'cancelled', inv.status);
  }

  async function invoicesPage() {
    const list = await api('/invoices');
    app.innerHTML = `
      <h1>Invoices</h1>
      <div class="list">${list.length ? list.map((inv) => `<div class="item invoice-row">
        <div class="main"><div class="title">${esc(inv.number)} · ${money(inv.amount)}</div>
          <div class="sub">${esc([inv.job && inv.job.service_type, inv.job && fmtDate(inv.job.scheduled_at.slice(0, 10))].filter(Boolean).join(' · ') || (inv.notes || '').slice(0, 80))}</div>
          <div class="sub">${inv.status === 'paid' ? `Paid ${esc(utcDate(inv.paid_at).toLocaleDateString())}` : inv.due_date ? `Due ${esc(fmtDate(inv.due_date))}` : `Sent ${esc(utcDate(inv.sent_at || inv.created_at).toLocaleDateString())}`}</div></div>
        <div class="right">${invoiceStatus(inv)}
          <div class="row" style="margin-top:8px;justify-content:flex-end">
            <a class="btn sm secondary" href="${BASE}/invoices/${inv.id}">View</a>
            ${safeUrl(inv.pay_url) ? `<a class="btn sm" href="${esc(safeUrl(inv.pay_url))}" target="_blank" rel="noopener">Pay now</a>` : ''}
          </div></div></div>`).join('') : '<div class="empty">No invoices yet.</div>'}</div>
      ${helpLine}`;
  }

  async function invoiceDetail(id) {
    const inv = await api(`/invoices/${id}`);
    const c = inv.customer || {};
    const line = inv.job ? `${inv.job.service_type || 'Cleaning service'} — ${fmtWhen(inv.job.scheduled_at)}` : 'Cleaning services';
    document.title = `Invoice ${inv.number} · ${BUSINESS}`;
    app.innerHTML = `
      <div class="row between no-print" style="margin-bottom:14px">
        <a href="${ADMIN_PRINT ? '/admin#/invoices' : `${BASE}/invoices`}">← ${ADMIN_PRINT ? 'Back to admin' : 'All invoices'}</a>
        <div class="row">
          <button class="btn secondary" id="print">🖨 Print / Save PDF</button>
          ${safeUrl(inv.pay_url) && inv.status === 'sent' ? `<a class="btn" href="${esc(safeUrl(inv.pay_url))}" target="_blank" rel="noopener">Pay now ${money(inv.amount)}</a>` : ''}
        </div>
      </div>
      <article class="card invoice-sheet">
        <header class="inv-head">
          <div>
            <div class="row"><span class="brand-mark">S</span><strong class="inv-biz">${BUSINESS}</strong></div>
            <div class="muted small" style="margin-top:6px">Pittsburgh, PA<br>${PHONE} · ${EMAIL}<br>pghshinepro.com</div>
          </div>
          <div class="inv-meta">
            <div class="inv-title">INVOICE</div>
            <div><strong>${esc(inv.number)}</strong></div>
            <div class="muted small">Issued ${esc(utcDate(inv.sent_at || inv.created_at).toLocaleDateString())}</div>
            ${inv.due_date ? `<div class="muted small">Due ${esc(fmtDate(inv.due_date))}</div>` : ''}
            <div style="margin-top:6px">${invoiceStatus(inv)}</div>
          </div>
        </header>
        <div class="inv-to">
          <div class="muted small">BILL TO</div>
          <div><strong>${esc(c.name)}</strong></div>
          <div class="small">${esc([c.address, c.city, c.zip].filter(Boolean).join(', '))}</div>
          <div class="small">${esc([c.email, fmtPhone(c.phone)].filter(Boolean).join(' · '))}</div>
        </div>
        <table class="inv-table">
          <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
          <tbody><tr><td>${esc(line)}${inv.job && inv.job.address ? `<div class="muted small">${esc(inv.job.address)}</div>` : ''}${inv.notes ? `<div class="small inv-notes">${esc(inv.notes)}</div>` : ''}</td><td class="num">${money(inv.amount)}</td></tr></tbody>
          <tfoot><tr><td>Total</td><td class="num">${money(inv.amount)}</td></tr>
            ${inv.status === 'paid' ? `<tr class="paid-row"><td>Paid${inv.paid_at ? ` ${esc(utcDate(inv.paid_at).toLocaleDateString())}` : ''}</td><td class="num">${money(inv.amount)}</td></tr><tr><td>Balance due</td><td class="num">${money(0)}</td></tr>` : ''}
          </tfoot>
        </table>
        ${inv.status === 'void' ? '<div class="banner danger">This invoice has been voided. Nothing is owed on it.</div>' : ''}
        ${inv.status === 'sent' && safeUrl(inv.pay_url) ? `<p class="small">Pay online: <a href="${esc(safeUrl(inv.pay_url))}">${esc(safeUrl(inv.pay_url))}</a></p>` : ''}
        <p class="muted small">Thank you for choosing ${BUSINESS}! Questions about this invoice? Call or text ${PHONE} or email ${EMAIL}.</p>
      </article>`;
    $('#print').onclick = () => window.print();
  }

  // ---------- profile ----------
  async function profilePage() {
    const p = await api('/profile');
    app.innerHTML = `
      <h1>My profile</h1>
      <div class="grid-2">
        <form class="card" id="profile-form">
          <h2>Contact details</h2>
          <div class="form-grid">
            ${input('name', 'Full name', p.name, { full: true, attrs: 'autocomplete="name" required' })}
            <div class="field full"><label>Login email</label><div class="readonly">${esc(p.email)}</div><div class="muted small">To change your login email, call or text us.</div></div>
            ${input('phone', 'Mobile phone', fmtPhone(p.phone), { type: 'tel', full: true, attrs: 'autocomplete="tel"' })}
            ${input('address', 'Street address', p.address, { full: true, attrs: 'autocomplete="street-address"' })}
            ${input('city', 'City', p.city)}${input('zip', 'ZIP', p.zip, { attrs: 'inputmode="numeric" autocomplete="postal-code"' })}
          </div>
          <h3 style="margin-top:6px">Email preferences</h3>
          ${checkbox('email_updates', 'Email me about my bookings and requests', p.email_updates)}
          ${checkbox('marketing_opt_in', 'Send me occasional offers and cleaning tips', p.marketing_opt_in)}
          <button class="btn" type="submit">Save changes</button>
        </form>
        <form class="card" id="password-form">
          <h2>Change password</h2>
          ${input('current_password', 'Current password', '', { type: 'password', attrs: 'autocomplete="current-password" required' })}
          ${input('new_password', 'New password (8+ characters)', '', { type: 'password', attrs: 'autocomplete="new-password" minlength="8" required' })}
          ${input('confirm', 'Type the new password again', '', { type: 'password', attrs: 'autocomplete="new-password" required' })}
          <p class="muted small">Changing your password logs you out on your other devices.</p>
          <button class="btn" type="submit">Change password</button>
        </form>
      </div>${helpLine}`;
    $('#profile-form').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/profile', { method: 'PUT', body: formData(e.target) }); toast('Saved ✅'); } catch (err) { toast(err.message, true); }
    };
    $('#password-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.new_password.value !== f.confirm.value) return toast("The new passwords don't match", true);
      try {
        await api('/password', { method: 'POST', body: { current_password: f.current_password.value, new_password: f.new_password.value } });
        f.reset();
        toast('Password changed ✅');
      } catch (err) { toast(err.message, true); }
    };
  }

  // ---------- host: properties ----------
  function propertyForm(p) {
    const d = p || { checkout_time: '11:00', checkin_time: '16:00' };
    modal(p ? 'Edit property' : 'Add a property', `<div class="form-grid">
      ${input('name', 'Property name *', d.name, { full: true, attrs: 'placeholder="e.g. Lawrenceville Loft"' })}
      ${input('address', 'Address *', d.address, { full: true })}
      ${input('bedrooms', 'Bedrooms', d.bedrooms, { type: 'number', attrs: 'min="0" step="1"' })}${input('bathrooms', 'Bathrooms', d.bathrooms, { type: 'number', attrs: 'min="0" step="0.5"' })}
      ${input('checkout_time', 'Usual guest checkout', d.checkout_time, { type: 'time' })}${input('checkin_time', 'Usual guest check-in', d.checkin_time, { type: 'time' })}
      ${textarea('access_notes', 'How we get in (lockbox, door code, parking)', d.access_notes)}
      ${textarea('notes', 'Notes for the cleaners (linens, supplies, special requests)', d.notes)}
      </div>`, async (data) => {
      if (p) await api(`/properties/${p.id}`, { method: 'PUT', body: data });
      else await api('/properties', { method: 'POST', body: data });
      toast(p ? 'Property saved' : 'Property added');
      propertiesPage();
    }, { submitLabel: p ? 'Save' : 'Add property' });
  }

  async function propertiesPage() {
    const list = await api('/properties');
    app.innerHTML = `
      <div class="row between"><h1>My properties</h1><button class="btn" id="add">+ Add property</button></div>
      <div class="prop-grid">${list.length ? list.map((p) => `<div class="card prop">
        <div class="row between"><h2>🏠 ${esc(p.name)}</h2><button class="btn sm secondary" data-edit="${p.id}">Edit</button></div>
        <div class="muted">📍 ${esc(p.address)}</div>
        <dl class="kv" style="margin-top:10px">
          <dt>Size</dt><dd>${p.bedrooms == null && p.bathrooms == null ? '—' : `${p.bedrooms ?? '?'} bed · ${p.bathrooms ?? '?'} bath`}</dd>
          <dt>Checkout</dt><dd>${esc(fmtClock(p.checkout_time)) || '—'}</dd>
          <dt>Check-in</dt><dd>${esc(fmtClock(p.checkin_time)) || '—'}</dd>
          <dt>Next turnover</dt><dd>${p.next_turnover ? esc(fmtWhen(p.next_turnover)) : 'None booked'}</dd>
          ${p.access_notes ? `<dt>Access</dt><dd>${esc(p.access_notes)}</dd>` : ''}
          ${p.notes ? `<dt>Notes</dt><dd style="white-space:pre-wrap">${esc(p.notes)}</dd>` : ''}
        </dl>
        <div style="margin-top:12px"><a class="btn sm" href="/host/turnovers?request=1&property=${p.id}">Request a turnover</a></div>
      </div>`).join('') : '<div class="card empty">Add your first rental property so we can schedule turnovers.</div>'}</div>
      ${helpLine}`;
    $('#add').onclick = () => propertyForm();
    $$('[data-edit]').forEach((b) => (b.onclick = () => propertyForm(list.find((p) => String(p.id) === b.dataset.edit))));
  }

  // ---------- host: turnovers ----------
  async function turnoversPage() {
    const [t, props] = await Promise.all([api('/turnovers'), api('/properties')]);
    const qs = new URLSearchParams(location.search);
    const view = qs.get('view') || 'upcoming';
    const list = view === 'past' ? t.past : t.upcoming;
    const pending = t.requests.filter((r) => r.status === 'pending');
    app.innerHTML = `
      <div class="row between"><h1>Turnovers</h1><button class="btn" id="req">+ Request a turnover</button></div>
      ${pending.length ? `<div class="card"><h2>Waiting for our confirmation</h2><div class="list">${pending.map(requestItem).join('')}</div></div>` : ''}
      <div class="tabs"><button data-v="upcoming" class="${view === 'upcoming' ? 'active' : ''}">Upcoming (${t.upcoming.length})</button><button data-v="past" class="${view === 'past' ? 'active' : ''}">Past & reports (${t.past.length})</button></div>
      <div class="list">${list.length ? list.map((j) => bookingCard(j)).join('') : `<div class="empty">${view === 'upcoming' ? 'No upcoming turnovers.' : 'No past turnovers yet.'}</div>`}</div>
      ${t.requests.some((r) => r.status !== 'pending') ? `<h2 style="margin-top:28px">Past requests</h2><div class="list">${t.requests.filter((r) => r.status !== 'pending').slice(0, 20).map(requestItem).join('')}</div>` : ''}
      ${helpLine}`;
    $$('.tabs button').forEach((b) => (b.onclick = () => { location.search = `?view=${b.dataset.v}`; }));
    const openForm = (propertyId) => {
      if (!props.length) { toast('Add a property first', true); location.href = '/host/properties'; return; }
      const pick = props.find((p) => String(p.id) === String(propertyId)) || props[0];
      const form = modal('Request a turnover', `<div class="form-grid">
        ${select('property_id', 'Property', props.map((p) => [p.id, p.name]), pick.id, { full: true })}
        ${input('date', 'Cleaning date (guest checkout day)', '', { type: 'date', full: true, attrs: `min="${localISO(new Date()).slice(0, 10)}" required` })}
        ${input('checkout_time', 'Guest checks out at', pick.checkout_time, { type: 'time' })}
        ${input('checkin_time', 'Next guest checks in at', pick.checkin_time, { type: 'time' })}
        ${textarea('note', 'Notes (optional)', '', { placeholder: 'Early check-in, extra guests, restock coffee…' })}
        </div><p class="muted small">We will confirm by email once a cleaner is scheduled.</p>`, async (data) => {
        await api('/turnovers', { method: 'POST', body: data });
        toast('Turnover requested. We will confirm by email.');
        history.replaceState(null, '', '/host/turnovers');
        turnoversPage();
      });
      form.property_id.onchange = () => {
        const p = props.find((x) => String(x.id) === form.property_id.value);
        if (p) { form.checkout_time.value = p.checkout_time || ''; form.checkin_time.value = p.checkin_time || ''; }
      };
    };
    $('#req').onclick = () => openForm();
    if (qs.get('request')) openForm(qs.get('property'));
  }

  async function turnoverReport(id) {
    const { job, report } = await api(`/turnovers/${id}`);
    app.innerHTML = `
      <p><a href="/host/turnovers?view=past">← All turnovers</a></p>
      <h1>Turnover report</h1>
      <div class="card"><dl class="kv">
        <dt>When</dt><dd>${esc(fmtWhen(job.scheduled_at))}</dd>
        <dt>Property</dt><dd>${esc(job.property ? job.property.name : '')}</dd>
        <dt>Address</dt><dd>${esc(job.address || '')}</dd>
        <dt>Status</dt><dd>${status(job.status)}</dd>
        <dt>Cleaner</dt><dd>${esc(job.cleaners.join(', ') || '—')}</dd>
      </dl></div>
      ${report ? `<div class="grid-2">
        <div class="card"><h2>🧹 Cleaning notes</h2><p class="pre">${esc(report.notes || 'No notes.')}</p></div>
        <div class="card ${report.damage_notes ? 'damage' : ''}"><h2>⚠️ Damage</h2><p class="pre">${esc(report.damage_notes || 'No damage found.')}</p></div>
        <div class="card"><h2>📦 Inventory & supplies</h2><p class="pre">${esc(report.inventory_notes || 'Nothing to report.')}</p></div>
      </div>
      <div class="card"><h2>📷 Photos (${report.photos.length})</h2>
        ${report.photos.length ? `<div class="photo-grid">${report.photos.map((p) => `<a href="/api/portal/photos/${job.id}/${esc(p.file)}" target="_blank" rel="noopener"><img src="/api/portal/photos/${job.id}/${esc(p.file)}" alt="${esc(p.name)}" loading="lazy"></a>`).join('')}</div>` : '<div class="empty small">No photos for this turnover.</div>'}
      </div>` : '<div class="card empty">The report for this turnover is not ready yet.</div>'}
      ${helpLine}`;
  }

  // ---------- router ----------
  async function start() {
    if (ADMIN_PRINT) {
      chrome();
      return guard(() => invoiceDetail(pathname.split('/').pop()));
    }
    if (sub === 'login') { chrome(); return loginPage(); }
    if (sub === 'register' || sub === 'forgot') { chrome(); return emailLinkPage(sub); }
    if (sub === 'set-password') { chrome(); return setPasswordPage(); }

    SESSION = await api('/session').catch(() => ({ loggedIn: false }));
    if (!SESSION.loggedIn) { location.replace(`${BASE}/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
    if (MODE === 'host' && !SESSION.is_host) { location.replace('/portal'); return; }
    chrome();
    const routes = [
      [/^$/, dashboard],
      [/^bookings$/, bookingsPage],
      [/^invoices$/, invoicesPage],
      [/^invoices\/(\d+)$/, invoiceDetail],
      [/^profile$/, profilePage],
      ...(MODE === 'host' ? [[/^properties$/, propertiesPage], [/^turnovers$/, turnoversPage], [/^turnovers\/(\d+)$/, turnoverReport]] : []),
    ];
    for (const [re, fn] of routes) {
      const m = re.exec(sub);
      if (m) return guard(() => fn(...m.slice(1)));
    }
    app.innerHTML = `<div class="empty">Page not found. <a href="${BASE}">Go to your account</a></div>`;
  }

  async function guard(fn) {
    try { await fn(); } catch (err) {
      if (err.message !== 'Please log in') app.innerHTML = `<div class="banner danger">${esc(err.message)}</div><p><a href="${ADMIN_PRINT ? '/admin' : BASE}">← Back</a></p>`;
    }
  }

  start();
})();

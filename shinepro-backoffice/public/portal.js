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
  const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}" /></svg>`;
  // "in 3 days", "tomorrow", "today" for the next visit.
  const untilText = (local) => {
    const day = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const n = Math.round((day(local) - day(new Date())) / 86400000);
    return n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 7 ? `In ${n} days` : `In ${Math.round(n / 7)} week${n < 11 ? '' : 's'}`;
  };
  // Downloads a calendar file (.ics) for a visit; works with Apple, Google and Outlook calendars.
  function addToCalendar(j) {
    const start = new Date(j.scheduled_at);
    const end = new Date(start.getTime() + (Number(j.duration_hours) || 3) * 3600000);
    const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const clean = (t) => String(t || '').replace(/[,;\\]/g, (c) => `\\${c}`).replace(/\n/g, ' ');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PGH Shine Pro//Portal//EN', 'BEGIN:VEVENT',
      `UID:shinepro-job-${j.id}@pghshinepro.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${clean(`${j.service_type || 'Cleaning'} · PGH Shine Pro`)}`,
      j.address ? `LOCATION:${clean(j.address)}` : '',
      `DESCRIPTION:${clean(`${cleanersText(j)}. Questions? Call or text ${PHONE}.`)}`,
      'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = `shinepro-cleaning-${new Date(j.scheduled_at).toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
  }
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
      pill.textContent = 'Admin';
      pill.classList.remove('hidden');
      nav.innerHTML = '<a href="/admin#/invoices">← Back to invoices</a>';
      nav.classList.remove('hidden');
      return;
    }
    pill.textContent = MODE === 'host' ? 'Host portal' : 'Client portal';
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
    const icons = { '': 'home', bookings: 'calendar', turnovers: 'repeat', properties: 'building', invoices: 'receipt', profile: 'user' };
    const tabbar = $('#tabbar');
    tabbar.innerHTML = links.map(([p, l]) => `<a href="${BASE}${p ? `/${p}` : ''}" class="${section === p ? 'active' : ''}"${section === p ? ' aria-current="page"' : ''}>${icon(icons[p])}<span>${l}</span></a>`).join('');
    tabbar.classList.remove('hidden');
    $('#logout').onclick = (e) => { e.preventDefault(); logout(); };
  }

  async function logout() {
    await api('/logout', { method: 'POST', body: {} }).catch(() => {});
    location.href = `${BASE}/login`;
  }

  // ---------- public screens (no login) ----------
  function authCard(inner) {
    app.innerHTML = `<div class="login-wrap"><div class="card login">
      <div class="auth-head"><svg class="brand-logo" aria-hidden="true"><use href="#i-logo" /></svg>
        <div><strong>${BUSINESS}</strong><div class="muted small">${MODE === 'host' ? 'Host portal for Airbnb and short-term rental owners' : 'Client portal'}</div></div></div>
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
      ${helpLine}
      <p class="muted small owner-note">Business owner? The admin dashboard has its own sign-in at <a href="/admin">/admin</a>.</p>`);
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
        ${j.address ? `<div class="sub">${icon('pin')}<span>${esc(j.address)}</span></div>` : ''}
        <div class="sub">${icon('broom')}<span>${esc(cleanersText(j))}</span></div>
        ${j.pending_request ? `<div class="sub"><span class="status st-new">${esc(requestLabel(j.pending_request))}</span></div>` : ''}
        ${actions ? `<div class="row" style="margin-top:10px">
          <button class="btn sm secondary" data-ics="${j.id}">${icon('plus-cal')}Add to calendar</button>
          ${!j.pending_request ? `<button class="btn sm secondary" data-resched="${j.id}">Reschedule</button>
          <button class="btn sm danger" data-cancel="${j.id}">Cancel</button>` : ''}</div>` : ''}
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

  // Request form with the same price list and itemized estimate as the website.
  function newCleaningForm(profile) {
    const SP = window.ShinePricing;
    if (!SP) return legacyCleaningForm(profile);
    const PR = SP.PRICING;
    const ids = ['standard', 'deep', 'move', 'recurring', 'apartment', 'airbnb', 'event'].filter((id) => PR.services[id]);
    const freqs = Object.keys(PR.frequency).filter((id) => PR.frequency[id].discount > 0);
    const requestId = `portal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const form = modal('Request a cleaning', `<div class="form-grid">
      ${select('service_type', 'Service', ids.map((id) => [id, PR.services[id].label]), 'standard', { full: true })}
      ${select('bedrooms', 'Home size', PR.sizes.map((z) => [z.id, z.label]), '2')}
      <div class="field" data-freq>${select('frequency', 'How often', freqs.map((id) => [id, `${PR.frequency[id].label} (save ${Math.round(PR.frequency[id].discount * 100)}%)`]), 'biweekly').replace(/^<div class="field ">|<\/div>$/g, '')}</div>
      <div class="field full"><span class="label-like">Add-ons (optional)</span><div class="addon-picks">${PR.addons.map((a) => `<label data-addon="${a.id}"><input type="checkbox" name="addon_${a.id}"> <span>${esc(a.label)}</span> <small class="muted" data-addon-price></small></label>`).join('')}</div></div>
      <div class="field" data-hours hidden>${input('organizing_hours', 'Organizing hours', '2', { type: 'number', attrs: 'min="1" max="8" step="1"' }).replace(/^<div class="field ">|<\/div>$/g, '')}</div>
      ${input('preferred_date', 'Preferred date', '', { type: 'date', attrs: `min="${localISO(new Date()).slice(0, 10)}"` })}
      ${input('address', 'Address', [profile.address, profile.city].filter(Boolean).join(', '), { full: true, attrs: 'autocomplete="street-address"' })}
      ${textarea('message', 'Anything we should know?', '', { placeholder: 'Pets, parking, rooms to focus on…' })}
      </div>
      <div class="estimate-box" aria-live="polite"><h3>Your estimate</h3><ul class="q-lines" data-lines></ul><p class="muted small" data-note></p></div>`, async (data) => {
      const addons = PR.addons.filter((a) => data[`addon_${a.id}`]).map((a) => a.id);
      const recurring = !!PR.services[data.service_type].recurring;
      await api('/bookings/new', { method: 'POST', body: {
        service_type: data.service_type, bedrooms: data.bedrooms, frequency: recurring ? data.frequency : 'once', addons,
        organizing_hours: addons.includes('organizing') ? Number(data.organizing_hours) : null,
        preferred_date: data.preferred_date, address: data.address, zip: zipFor(), message: data.message, request_id: requestId,
      } });
      toast('Request sent. We will call or email to confirm a time.');
    });
    // The travel fee depends on distance: a ZIP typed in the address, else the one on file.
    const zipFor = () => ((/\b\d{5}\b/.exec(form.address.value) || [])[0] || profile.zip || '');
    const update = () => {
      const s = PR.services[form.service_type.value];
      const picked = PR.addons.filter((a) => form[`addon_${a.id}`].checked).map((a) => a.id);
      $('[data-freq]', form).hidden = !s.recurring;
      $('[data-hours]', form).hidden = !picked.includes('organizing');
      $$('[data-addon]', form).forEach((l) => {
        const a = PR.addons.find((x) => x.id === l.dataset.addon);
        const inc = (s.included || []).includes(a.id);
        l.classList.toggle('is-included', inc);
        $('[data-addon-price]', l).textContent = inc ? 'Included' : `+$${a.price}${a.perHour ? '/hr' : ''}`;
      });
      const q = SP.quote({ service: form.service_type.value, size: form.bedrooms.value, frequency: s.recurring ? form.frequency.value : null, addons: picked, organizingHours: form.organizing_hours.value, zip: zipFor() });
      const amt = (l) => (l.kind === 'included' ? 'Included' : l.kind === 'travel' && !l.amount ? 'Free' : `${l.amount < 0 ? '−' : ''}$${Math.abs(l.amount)}`);
      const label = (l) => (l.kind === 'travel' ? `${PR.travelFeeLabel}${l.amount ? '' : ` (within ${PR.travelFreeMiles} miles)`}` : l.label.replace(/ — included$/, ''));
      $('[data-lines]', form).innerHTML = q.lines.map((l) => `<li class="q-${l.kind}"><span>${esc(label(l))}</span><span>${amt(l)}</span></li>`).join('')
        + `<li class="q-total"><span>${s.recurring ? 'Total per visit' : 'Estimated total'}</span><span>${q.quoteOnly ? 'Custom quote' : `$${q.total}`}</span></li>`;
      const travelNote = q.travelMiles == null
        ? ` The $${PR.travelFee} travel fee is removed for homes within ${PR.travelFreeMiles} miles; add your ZIP to the address to check.`
        : q.travelFee ? ` Your home is about ${q.travelMiles} miles away, so the $${PR.travelFee} travel fee applies.` : ` Your home is within ${PR.travelFreeMiles} miles, so there's no travel fee.`;
      $('[data-note]', form).textContent = (q.quoteOnly
        ? "We'll send a personalized price."
        : 'This is an estimate. We confirm the price and time with you before booking.') + travelNote;
    };
    // A running total beside the Send button, so it stays in view on a phone.
    const total = document.createElement('div');
    total.className = 'modal-total';
    $('.actions', form).prepend(total);
    const baseUpdate = update;
    const withTotal = () => {
      baseUpdate();
      const t = $('[data-lines] .q-total span:last-child', form);
      total.innerHTML = `<span class="muted small">Estimate</span><strong>${t ? esc(t.textContent) : ''}</strong>`;
    };
    form.addEventListener('change', withTotal);
    form.addEventListener('input', withTotal);
    withTotal();
  }

  // Fallback if the price list didn't load.
  function legacyCleaningForm(profile) {
    modal('Request a cleaning', `<div class="form-grid">
      ${select('service_type', 'Service', SERVICES.map((s) => [s, s]), SERVICES[0], { full: true })}
      ${select('frequency', 'How often', FREQUENCIES.map((s) => [s, s]), FREQUENCIES[0])}
      ${input('preferred_date', 'Preferred date', '', { type: 'date', attrs: `min="${localISO(new Date()).slice(0, 10)}"` })}
      ${input('address', 'Address', [profile.address, profile.city].filter(Boolean).join(', '), { full: true })}
      ${textarea('message', 'Anything we should know?', '', { placeholder: 'Rooms, pets, add-ons like inside the fridge or oven…' })}
      </div><p class="muted small">We will confirm the price and time with you before booking.</p>`, async (data) => {
      await api('/bookings/new', { method: 'POST', body: data });
      toast('Request sent. We will call or email to confirm a time.');
    });
  }

  // ---------- client: dashboard ----------
  const tile = (href, ico, t, d, extra = '') => `<a class="tile${extra}" href="${href}"><span class="icon">${icon(ico)}</span><span><div class="t">${t}</div><div class="d">${d}</div></span><span class="chev">${icon('chev')}</span></a>`;
  const pendingBanner = (n) => (n ? `<div class="banner warn">You have ${n} request${n === 1 ? '' : 's'} waiting for our reply. We usually answer the same day.</div>` : '');
  const invoiceCard = (d) => `<div class="card hero-card">
          <div class="label">Open invoices</div>
          <div class="big">${money(d.open_invoices.total)}</div>
          <div class="muted">${d.open_invoices.count ? `${d.open_invoices.count} invoice${d.open_invoices.count === 1 ? '' : 's'} to pay` : 'You are all paid up. Thank you!'}</div>
          <div class="row" style="margin-top:14px"><a class="btn sm secondary" href="${BASE}/invoices">${icon('receipt')}See invoices</a></div>
        </div>`;
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

  async function dashboard() {
    const d = await api('/dashboard');
    const first = (d.name || '').split(' ')[0];
    if (MODE === 'host') return hostDashboard(d, first);
    const n = d.next_job;
    app.innerHTML = `
      <h1>${greeting()}${first ? `, ${esc(first)}` : ''}</h1>
      <p class="page-sub">${n ? 'Here is what is coming up at your place.' : 'Everything for your cleanings in one place.'}</p>
      <div class="grid-2">
        <div class="card hero-card${n ? ' next-visit' : ''}">
          ${n ? `<span class="when-chip">${icon('clock')}${esc(untilText(n.scheduled_at))}</span>
            <div class="label">Your next cleaning</div>
            <div class="big">${esc(fmtDay(n.scheduled_at))}</div>
            <div class="meta">
              <div>${icon('clock')}<span>${esc(fmtTime(n.scheduled_at))}${n.service_type ? `, ${esc(n.service_type)}` : ''}</span></div>
              ${n.address ? `<div>${icon('pin')}<span>${esc(n.address)}</span></div>` : ''}
              <div>${icon('broom')}<span>${esc(cleanersText(n))}</span></div>
            </div>
            ${n.pending_request ? `<div style="margin-top:8px"><span class="status st-new">${esc(requestLabel(n.pending_request))}</span></div>` : ''}
            <div class="row" style="margin-top:16px"><button class="btn sm light" id="ics">${icon('plus-cal')}Add to calendar</button><a class="btn sm ghost-light" href="/portal/bookings">Manage bookings</a></div>`
            : `<div class="label">Your next cleaning</div><div class="big">Nothing booked yet</div><p class="muted">Tell us what you need and we will get back to you the same day with a time.</p>
            <div class="row" style="margin-top:6px"><button class="btn sm" data-new>${icon('sparkle')}Request a cleaning</button></div>`}
        </div>
        ${invoiceCard(d)}
      </div>
      ${pendingBanner(d.pending_requests)}
      <h2 class="section-title">Quick actions</h2>
      <div class="tiles">
        <a class="tile primary" href="#" data-new><span class="icon">${icon('sparkle')}</span><span><div class="t">Request a cleaning</div><div class="d">See your price before you send</div></span><span class="chev">${icon('chev')}</span></a>
        ${tile('/portal/bookings', 'calendar', 'My bookings', `${d.upcoming_count} upcoming`)}
        ${tile('/portal/invoices', 'receipt', 'Invoices', 'View, print and pay')}
        ${tile('/portal/profile', 'user', 'My profile', 'Address, phone, password')}
        ${d.is_host ? tile('/host', 'building', 'Host portal', 'Properties and turnovers') : ''}
        ${tile(PHONE_LINK, 'phone', 'Call or text us', PHONE)}
      </div>`;
    $$('[data-new]').forEach((b) => (b.onclick = async (e) => { e.preventDefault(); newCleaningForm(await api('/profile')); }));
    if (n) $('#ics').onclick = () => addToCalendar(n);
  }

  function hostDashboard(d, first) {
    const n = d.next_turnover;
    app.innerHTML = `
      <h1>${greeting()}${first ? `, ${esc(first)}` : ''}</h1>
      <p class="page-sub">Your rentals, turnovers and cleaning reports.</p>
      <div class="grid-2">
        <div class="card hero-card${n ? ' next-visit' : ''}">
          ${n ? `<span class="when-chip">${icon('clock')}${esc(untilText(n.scheduled_at))}</span>
            <div class="label">Next turnover</div>
            <div class="big">${esc(fmtDay(n.scheduled_at))}</div>
            <div class="meta">
              <div>${icon('clock')}<span>${esc(fmtTime(n.scheduled_at))}</span></div>
              ${n.property ? `<div>${icon('building')}<span>${esc(n.property.name)}</span></div>` : ''}
              <div>${icon('broom')}<span>${esc(cleanersText(n))}</span></div>
            </div>
            <div class="row" style="margin-top:16px"><button class="btn sm light" id="ics">${icon('plus-cal')}Add to calendar</button><a class="btn sm ghost-light" href="/host/turnovers">All turnovers</a></div>`
            : `<div class="label">Next turnover</div><div class="big">No turnovers booked</div><p class="muted">Add your guest checkout dates and we will handle the rest.</p>`}
        </div>
        ${invoiceCard(d)}
      </div>
      ${pendingBanner(d.pending_requests)}
      <h2 class="section-title">Quick actions</h2>
      <div class="tiles">
        ${tile('/host/turnovers?request=1', 'repeat', 'Request a turnover', 'Checkout date and times', ' primary')}
        ${tile('/host/turnovers', 'calendar', 'Turnovers', `${d.upcoming_turnovers} upcoming, plus reports`)}
        ${tile('/host/properties', 'building', 'Properties', `${d.properties} propert${d.properties === 1 ? 'y' : 'ies'}`)}
        ${tile('/host/invoices', 'receipt', 'Invoices', 'View, print and pay')}
        ${tile('/host/profile', 'user', 'Profile', 'Contact info, password')}
        ${tile(PHONE_LINK, 'phone', 'Call or text us', PHONE)}
      </div>`;
    if (n) $('#ics').onclick = () => addToCalendar(n);
  }

  // ---------- client: bookings ----------
  async function bookingsPage() {
    const [b, profile] = await Promise.all([api('/bookings'), api('/profile')]);
    const view = new URLSearchParams(location.search).get('view') || 'upcoming';
    const list = view === 'past' ? b.past : b.upcoming;
    app.innerHTML = `
      <div class="row between"><h1>My bookings</h1><button class="btn" id="new">${icon('sparkle')}Request a cleaning</button></div>
      <div class="tabs"><button data-v="upcoming" class="${view === 'upcoming' ? 'active' : ''}">Upcoming (${b.upcoming.length})</button><button data-v="past" class="${view === 'past' ? 'active' : ''}">Past (${b.past.length})</button></div>
      <div class="list">${list.length ? list.map((j) => bookingCard(j, { actions: view === 'upcoming' })).join('')
        : `<div class="empty">${view === 'upcoming' ? 'No upcoming cleanings. Tap “Request a cleaning” to book one.' : 'No past cleanings yet.'}</div>`}</div>
      ${b.requests.length ? `<h2 style="margin-top:28px">Your requests</h2><div class="list">${b.requests.map(requestItem).join('')}</div>` : ''}
      ${helpLine}`;
    $$('.tabs button').forEach((btn) => (btn.onclick = () => { location.search = `?view=${btn.dataset.v}`; }));
    $('#new').onclick = () => newCleaningForm(profile);
    const byId = (id) => b.upcoming.find((j) => String(j.id) === id);
    $$('[data-ics]').forEach((btn) => (btn.onclick = () => addToCalendar(byId(btn.dataset.ics))));
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
    // Every line of the invoice (older invoices have a single line).
    const items = inv.items && inv.items.length ? inv.items : [{ description: line, amount: inv.amount, kind: 'other' }];
    document.title = `Invoice ${inv.number} · ${BUSINESS}`;
    app.innerHTML = `
      <div class="row between no-print" style="margin-bottom:14px">
        <a class="portal-back" style="margin:0" href="${ADMIN_PRINT ? '/admin#/invoices' : `${BASE}/invoices`}">${icon('chev')}<span>${ADMIN_PRINT ? 'Back to admin' : 'Back to invoices'}</span></a>
        <div class="row">
          <button class="btn secondary" id="print">Print or save PDF</button>
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
          <tbody>${items.map((it, i) => `<tr><td>${esc(it.description)}${i === 0 && inv.job && inv.job.address ? `<div class="muted small">${esc(inv.job.address)}</div>` : ''}</td><td class="num">${it.kind === 'included' && !Number(it.amount) ? 'Included' : `${Number(it.amount) < 0 ? '−' : ''}${money(Math.abs(it.amount))}`}</td></tr>`).join('')}
            ${inv.notes ? `<tr><td colspan="2"><div class="small inv-notes">${esc(inv.notes)}</div></td></tr>` : ''}</tbody>
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
      </div>
      <div class="card row between" style="margin-top:16px"><div><strong>Signed in as ${esc(p.email)}</strong><div class="muted small">Log out when you're done on a shared device.</div></div><button class="btn secondary" id="logout-btn">${icon('out')}Log out</button></div>
      ${helpLine}`;
    $('#logout-btn').onclick = logout;
    $('#profile-form').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/profile', { method: 'PUT', body: formData(e.target) }); toast('Changes saved'); } catch (err) { toast(err.message, true); }
    };
    $('#password-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.new_password.value !== f.confirm.value) return toast("The new passwords don't match", true);
      try {
        await api('/password', { method: 'POST', body: { current_password: f.current_password.value, new_password: f.new_password.value } });
        f.reset();
        toast('Password changed');
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
      <div class="row between"><h1>My properties</h1><button class="btn" id="add">${icon('building')}Add property</button></div>
      <div class="prop-grid">${list.length ? list.map((p) => `<div class="card prop">
        <div class="row between"><h2>${esc(p.name)}</h2><button class="btn sm secondary" data-edit="${p.id}">Edit</button></div>
        <div class="muted row" style="gap:6px">${icon('pin')}<span>${esc(p.address)}</span></div>
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
      <div class="row between"><h1>Turnovers</h1><button class="btn" id="req">${icon('repeat')}Request a turnover</button></div>
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
      <a class="portal-back" href="/host/turnovers?view=past">${icon('chev')}<span>Back to turnovers</span></a>
      <h1>Turnover report</h1>
      <div class="card"><dl class="kv">
        <dt>When</dt><dd>${esc(fmtWhen(job.scheduled_at))}</dd>
        <dt>Property</dt><dd>${esc(job.property ? job.property.name : '')}</dd>
        <dt>Address</dt><dd>${esc(job.address || '')}</dd>
        <dt>Status</dt><dd>${status(job.status)}</dd>
        <dt>Cleaner</dt><dd>${esc(job.cleaners.join(', ') || '—')}</dd>
      </dl></div>
      ${report ? `<div class="grid-2">
        <div class="card"><h2>Cleaning notes</h2><p class="pre">${esc(report.notes || 'No notes.')}</p></div>
        <div class="card ${report.damage_notes ? 'damage' : ''}"><h2>Damage</h2><p class="pre">${esc(report.damage_notes || 'No damage found.')}</p></div>
        <div class="card"><h2>Inventory and supplies</h2><p class="pre">${esc(report.inventory_notes || 'Nothing to report.')}</p></div>
      </div>
      <div class="card"><h2>Photos (${report.photos.length})</h2>
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
      if (m) return guard(async () => { await fn(...m.slice(1)); addBackLink(); });
    }
    app.innerHTML = `<div class="empty">Page not found. <a href="${BASE}">Go to your account</a></div>`;
  }

  // A "Back" link at the top of each section page (detail pages have their own).
  function addBackLink() {
    if (!sub || sub.includes('/')) return;
    const back = document.createElement('a');
    back.className = 'portal-back';
    back.href = BASE;
    back.innerHTML = `${icon('chev')}<span>Back to home</span>`;
    back.onclick = (e) => {
      const fromHere = document.referrer && new URL(document.referrer).origin === location.origin && document.referrer !== location.href;
      if (fromHere && history.length > 1) { e.preventDefault(); history.back(); }
    };
    app.prepend(back);
  }

  async function guard(fn) {
    try { await fn(); } catch (err) {
      if (err.message !== 'Please log in') app.innerHTML = `<div class="banner danger">${esc(err.message)}</div><p><a href="${ADMIN_PRINT ? '/admin' : BASE}">← Back</a></p>`;
    }
  }

  start();
})();

/*
 * Shine Pro Cleaning — website chat widget.
 * Add ONE line to every page (before </body>):
 *
 *   <script src="https://YOUR-BACKOFFICE-DOMAIN/chat.js" async></script>
 *
 * Customers verify their email (code by email) and phone (code by text, via Firebase)
 * before chatting. The AI assistant answers questions; customers can request a call back.
 */
(function () {
  if (window.__shineproChat) return;
  window.__shineproChat = true;

  var script = document.currentScript;
  var BASE = script && script.src ? new URL(script.src).origin : '';
  var FIREBASE_VERSION = '10.14.1';
  var STORE = 'shinepro_chat_token';

  var state = { view: 'intro', config: null, token: null, messages: [], lastId: 0, form: {}, confirmation: null, busy: false, poll: null };

  // ---------- styles ----------
  var css = '' +
    '.spc,.spc *{box-sizing:border-box;font-family:inherit}.spc[hidden]{display:none!important}' +
    '.spc-launch{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;align-items:center;gap:8px;background:#1b6f66;color:#fff;border:0;border-radius:999px;padding:14px 22px;font:600 16px/1 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2);cursor:pointer}' +
    '.spc-launch:hover{background:#145249}' +
    '.spc-panel{position:fixed;right:16px;bottom:16px;z-index:2147483001;width:min(400px,calc(100vw - 32px));height:min(640px,calc(100vh - 32px));background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden;color:#16201e;font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}' +
    '.spc-head{background:#1b6f66;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px}' +
    '.spc-av{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.18);display:grid;place-items:center;font-size:18px;flex:none}' +
    '.spc-title{font-weight:700;font-size:16px}.spc-sub{font-size:13px;opacity:.9;display:flex;align-items:center;gap:6px}' +
    '.spc-dot{width:8px;height:8px;border-radius:50%;background:#f5c542}.spc-dot.on{background:#5ee08f}' +
    '.spc-x{margin-left:auto;background:none;border:0;color:#fff;font-size:22px;cursor:pointer;padding:4px 8px;line-height:1}' +
    '.spc-body{flex:1;overflow-y:auto;padding:18px}' +
    '.spc-center{text-align:center;display:flex;flex-direction:column;justify-content:center;min-height:100%;gap:10px}' +
    '.spc-big{width:64px;height:64px;border-radius:50%;background:#e3f1ee;display:grid;place-items:center;font-size:28px;margin:0 auto}' +
    '.spc h3{margin:4px 0;font-size:18px}.spc p{margin:0}.spc-muted{color:#66716f;font-size:13px}' +
    '.spc-btn{display:block;width:100%;border:0;border-radius:12px;padding:13px;font:600 15px system-ui,sans-serif;background:#1b6f66;color:#fff;cursor:pointer}' +
    '.spc-btn:disabled{opacity:.6;cursor:wait}.spc-btn.sec{background:#fff;color:#1b6f66;border:1px solid #cfd5d4}' +
    '.spc-f{margin-bottom:12px;text-align:left}.spc-f label{display:block;font-size:13px;font-weight:600;margin-bottom:4px}' +
    '.spc-f input,.spc-f textarea{width:100%;font:inherit;font-size:16px;padding:10px 12px;border:1px solid #cfd5d4;border-radius:10px;background:#fff;color:#16201e}' +
    '.spc-f textarea{min-height:90px;resize:vertical}.spc-ck{display:flex;gap:8px;font-size:13px;align-items:flex-start;text-align:left;margin-bottom:12px}.spc-ck input{margin-top:3px}' +
    '.spc-err{color:#c0392b;font-size:14px;margin:6px 0 10px;text-align:left}' +
    '.spc-code{letter-spacing:.3em;text-align:center;font-size:20px!important}' +
    '.spc-msgs{display:flex;flex-direction:column;gap:8px}' +
    '.spc-m{max-width:85%;padding:9px 13px;border-radius:16px;white-space:pre-wrap;word-wrap:break-word}' +
    '.spc-m.in{align-self:flex-end;background:#1b6f66;color:#fff;border-bottom-right-radius:4px}' +
    '.spc-m.out{align-self:flex-start;background:#eef1f1;border-bottom-left-radius:4px}' +
    '.spc-m.team{background:#e6ecfb}.spc-m small{display:block;font-size:11px;opacity:.7;margin-top:2px}' +
    '.spc-typing{align-self:flex-start;color:#66716f;font-size:13px;padding:4px 6px}' +
    '.spc-foot{border-top:1px solid #e3e6e5;padding:10px 12px;display:flex;flex-direction:column;gap:8px}' +
    '.spc-row{display:flex;gap:8px}.spc-row input{flex:1;font:inherit;font-size:16px;padding:10px 12px;border:1px solid #cfd5d4;border-radius:10px}' +
    '.spc-send{border:0;border-radius:10px;background:#1b6f66;color:#fff;padding:0 16px;font-weight:600;cursor:pointer}' +
    '.spc-cb{background:none;border:1px solid #f0c4bf;color:#c0392b;border-radius:10px;padding:8px;font-weight:600;cursor:pointer}' +
    '.spc-link{background:none;border:0;color:#1b6f66;text-decoration:underline;cursor:pointer;font-size:13px;padding:0}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    return fetch(BASE + '/api/chat' + path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401 && state.token) { endSession(); }
          if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
          return d;
        });
      });
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Could not load verification. Please refresh and try again.')); };
      document.head.appendChild(s);
    });
  }
  var fbAuth = null;
  function firebaseAuth() {
    if (fbAuth) return Promise.resolve(fbAuth);
    var base = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/';
    return (window.firebase ? Promise.resolve() : loadScript(base + 'firebase-app-compat.js'))
      .then(function () { return window.firebase.auth ? null : loadScript(base + 'firebase-auth-compat.js'); })
      .then(function () {
        var app;
        try { app = window.firebase.app('shinepro'); } catch (e) { app = window.firebase.initializeApp(state.config.firebase, 'shinepro'); }
        fbAuth = app.auth();
        return fbAuth;
      });
  }

  // ---------- DOM ----------
  var launcher = document.createElement('button');
  launcher.className = 'spc spc-launch';
  launcher.type = 'button';
  launcher.innerHTML = '<span aria-hidden="true">💬</span> Chat With Us';
  var panel = document.createElement('div');
  panel.className = 'spc spc-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Chat with Shine Pro Cleaning');
  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  launcher.onclick = open;
  function open() {
    launcher.hidden = true; panel.hidden = false;
    if (!state.config) {
      api('/config').then(function (c) {
        state.config = c;
        state.token = load(STORE);
        if (!c.enabled) state.view = 'unavailable';
        else if (state.token) { state.view = 'chat'; fetchMessages(); }
        render();
      }).catch(function () { state.config = { enabled: false, businessPhone: '(412) 447-8047' }; state.view = 'unavailable'; render(); });
    }
    render();
    startPolling();
  }
  function close() { panel.hidden = true; launcher.hidden = false; stopPolling(); }

  function header() {
    var phone = state.config && state.config.businessPhone ? state.config.businessPhone : '';
    return '<div class="spc-head"><div class="spc-av">💬</div><div><div class="spc-title">PGH Shine Pro</div>' +
      '<div class="spc-sub"><span class="spc-dot' + (state.config && state.config.enabled ? ' on' : '') + '"></span>' +
      (state.config && state.config.enabled ? 'AI Assistant Available' : esc(phone || 'Connecting…')) + '</div></div>' +
      '<button class="spc-x" type="button" data-close aria-label="Close chat">×</button></div>';
  }

  function render() {
    var v = state.view, body = '', foot = '';
    var phone = state.config ? state.config.businessPhone : '';
    if (!state.config) {
      body = '<div class="spc-center"><p class="spc-muted">Loading…</p></div>';
    } else if (v === 'unavailable') {
      body = '<div class="spc-center"><div class="spc-big">📞</div><h3>We\'d love to help</h3>' +
        '<p>Chat is offline right now. Please call or text us at <a href="tel:' + esc((phone || '').replace(/\D/g, '')) + '"><strong>' + esc(phone) + '</strong></a>.</p></div>';
    } else if (v === 'intro') {
      body = '<div class="spc-center"><div class="spc-big">💬</div><h3>Start a Conversation</h3>' +
        '<p class="spc-muted">Chat with our AI assistant or leave a note and we\'ll call you as soon as possible. To keep chats secure, we\'ll verify your email and phone with a quick code.</p>' +
        '<button class="spc-btn" type="button" data-go="details">Start Chat</button></div>';
    } else if (v === 'details') {
      var f = state.form;
      body = '<form novalidate data-form="details"><h3>Tell us who you are</h3><p class="spc-muted" style="margin-bottom:14px">We\'ll send a 6-digit code to your email and a code by text to your phone.</p>' +
        field('name', 'Full name', 'text', f.name, 'autocomplete="name" required') +
        field('email', 'Email', 'email', f.email, 'autocomplete="email" required') +
        field('phone', 'Mobile phone', 'tel', f.phone, 'autocomplete="tel" required placeholder="(412) 555-0123"') +
        '<label class="spc-ck"><input type="checkbox" name="marketing_opt_in"' + (f.marketing_opt_in !== false ? ' checked' : '') + '> Send me occasional discounts and updates. Unsubscribe anytime.</label>' +
        err() + '<div id="spc-recaptcha"></div><button class="spc-btn" type="submit"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Sending codes…' : 'Send my codes') + '</button>' +
        '<p class="spc-muted" style="margin-top:10px">Standard message rates may apply.</p></form>';
    } else if (v === 'codes') {
      var needPhone = state.config.phoneVerification;
      body = '<form novalidate data-form="codes"><h3>Enter your codes</h3>' +
        field('email_code', 'Code sent to ' + esc(state.form.email), 'text', '', 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" class="spc-code" required') +
        (needPhone ? field('phone_code', 'Code texted to ' + esc(state.form.phone), 'text', '', 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" class="spc-code" required') : '') +
        err() + '<button class="spc-btn" type="submit"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Verifying…' : 'Verify & start chat') + '</button>' +
        '<p style="margin-top:12px;text-align:center"><button class="spc-link" type="button" data-go="details">Wrong info or no code? Go back</button></p></form>';
    } else if (v === 'chat') {
      body = '<div class="spc-msgs">' + state.messages.map(msgHtml).join('') + (state.busy ? '<div class="spc-typing">Assistant is typing…</div>' : '') + '</div>' + err();
      foot = '<form novalidate class="spc-row" data-form="msg"><input name="message" placeholder="Type your question…" autocomplete="off" maxlength="1000" aria-label="Message"><button class="spc-send" type="submit">Send</button></form>' +
        '<button class="spc-cb" type="button" data-go="callback">📞 Request a call back</button>';
    } else if (v === 'callback') {
      body = '<form novalidate data-form="callback"><h3>Request a call back</h3><p class="spc-muted" style="margin-bottom:14px">Leave a note and we\'ll call you as soon as possible.</p>' +
        '<div class="spc-f"><label for="spc-note">What can we help with?</label><textarea id="spc-note" name="note" required placeholder="e.g. Deep clean for a 3 bed / 2 bath before we move out on the 15th"></textarea></div>' +
        field('best_time', 'Best time to call (optional)', 'text', '', 'placeholder="e.g. weekdays after 5pm"') +
        err() + '<button class="spc-btn" type="submit"' + (state.busy ? ' disabled' : '') + '>Send request</button>' +
        '<p style="margin-top:12px;text-align:center"><button class="spc-link" type="button" data-go="chat">Back to chat</button></p></form>';
    }
    panel.innerHTML = header() + '<div class="spc-body">' + body + '</div>' + (foot ? '<div class="spc-foot">' + foot + '</div>' : '');
    bind();
    var b = panel.querySelector('.spc-body');
    if (v === 'chat') b.scrollTop = b.scrollHeight;
  }

  function field(name, label, type, value, attrs) {
    return '<div class="spc-f"><label for="spc-' + name + '">' + label + '</label><input id="spc-' + name + '" name="' + name + '" type="' + type + '" value="' + esc(value || '') + '" ' + (attrs || '') + '></div>';
  }
  function err() { return state.error ? '<div class="spc-err" role="alert">' + esc(state.error) + '</div>' : ''; }
  function msgHtml(m) {
    var cls = m.direction === 'in' ? 'in' : 'out' + (m.status === 'sent' ? ' team' : '');
    return '<div class="spc-m ' + cls + '">' + esc(m.body) + (m.status === 'sent' ? '<small>Shine Pro team</small>' : '') + '</div>';
  }

  function bind() {
    panel.querySelector('[data-close]').onclick = close;
    Array.prototype.forEach.call(panel.querySelectorAll('[data-go]'), function (b) {
      b.onclick = function () { state.error = null; state.view = b.getAttribute('data-go'); render(); };
    });
    var form = panel.querySelector('form');
    if (form) form.onsubmit = function (e) { e.preventDefault(); submit(form.getAttribute('data-form'), form); };
    var first = panel.querySelector('.spc-body input:not([type=checkbox]), .spc-body textarea, .spc-foot input');
    if (first && !('ontouchstart' in window)) first.focus();
  }

  function values(form) {
    var o = {};
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name) o[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
    return o;
  }
  function toE164(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (d.length === 10) return '+1' + d;
    if (d.length === 11 && d.charAt(0) === '1') return '+' + d;
    return null;
  }
  function fail(e) { state.busy = false; state.error = e && e.message ? e.message : String(e); render(); }

  function submit(kind, form) {
    var v = values(form);
    state.error = null;
    if (kind === 'details') {
      state.form = v;
      if (!v.name) return fail('Please enter your name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return fail('Please enter a valid email address.');
      var e164 = toE164(v.phone);
      if (!e164) return fail('Please enter a valid US mobile number with area code.');
      state.busy = true; render();
      var phoneStep = state.config.phoneVerification
        ? firebaseAuth().then(function (auth) {
            if (state.recaptcha) { try { state.recaptcha.clear(); } catch (x) {} }
            state.recaptcha = new window.firebase.auth.RecaptchaVerifier('spc-recaptcha', { size: 'invisible' }, auth.app);
            return auth.signInWithPhoneNumber(e164, state.recaptcha);
          }).then(function (c) { state.confirmation = c; })
          .catch(function (e) {
            var code = e && e.code;
            throw new Error(code === 'auth/invalid-phone-number' ? 'That phone number doesn\'t look right.'
              : code === 'auth/too-many-requests' ? 'Too many attempts. Please wait a few minutes and try again.'
              : 'We couldn\'t text a code to that number. Please check it and try again.');
          })
        : Promise.resolve();
      Promise.all([api('/email-code', { method: 'POST', body: { email: v.email } }), phoneStep])
        .then(function () { state.busy = false; state.view = 'codes'; render(); })
        .catch(fail);
    } else if (kind === 'codes') {
      if (!/^\d{6}$/.test(v.email_code)) return fail('Enter the 6-digit code from your email.');
      if (state.config.phoneVerification && !/^\d{6}$/.test(v.phone_code)) return fail('Enter the 6-digit code we texted you.');
      state.busy = true; render();
      var tokenStep = state.config.phoneVerification
        ? state.confirmation.confirm(v.phone_code).then(function (r) { return r.user.getIdToken(); })
            .catch(function () { throw new Error('That text code isn\'t right. Please check it and try again.'); })
        : Promise.resolve(null);
      tokenStep.then(function (phoneToken) {
        return api('/start', { method: 'POST', body: {
          name: state.form.name, email: state.form.email, phone: state.form.phone,
          marketing_opt_in: state.form.marketing_opt_in, email_code: v.email_code, phone_token: phoneToken,
        } });
      }).then(function (d) {
        if (fbAuth) fbAuth.signOut().catch(function () {});
        state.token = d.token; store(STORE, d.token);
        state.messages = d.messages; state.lastId = lastId(d.messages);
        state.busy = false; state.view = 'chat'; render(); startPolling();
      }).catch(fail);
    } else if (kind === 'msg') {
      if (!v.message || state.busy) return;
      var temp = { id: 0, direction: 'in', body: v.message };
      state.messages.push(temp); state.busy = true; render();
      api('/message', { method: 'POST', body: { message: v.message } }).then(function (d) {
        state.messages.splice(state.messages.indexOf(temp), 1);
        addMessages(d.messages); state.busy = false; render();
      }).catch(function (e) { state.messages.splice(state.messages.indexOf(temp), 1); fail(e); });
    } else if (kind === 'callback') {
      if (!v.note) return fail('Please add a short note so we know how to help.');
      state.busy = true; render();
      api('/callback', { method: 'POST', body: v }).then(function (d) {
        addMessages(d.messages); state.busy = false; state.view = 'chat'; render();
      }).catch(fail);
    }
  }

  function lastId(list) { return list.reduce(function (m, x) { return Math.max(m, x.id || 0); }, state.lastId || 0); }
  function addMessages(list) {
    list.forEach(function (m) { if (!state.messages.some(function (x) { return x.id && x.id === m.id; })) state.messages.push(m); });
    state.lastId = lastId(list);
  }
  function fetchMessages() {
    if (!state.token) return;
    api('/messages?after=' + state.lastId).then(function (list) {
      if (list.length) { addMessages(list); if (state.view === 'chat' && !state.busy) render(); }
    }).catch(function () { if (!state.token) render(); }); // session expired -> back to start
  }
  function startPolling() { stopPolling(); state.poll = setInterval(function () { if (!panel.hidden && state.view === 'chat' && !state.busy) fetchMessages(); }, 5000); }
  function stopPolling() { if (state.poll) clearInterval(state.poll); state.poll = null; }
  function endSession() { state.token = null; store(STORE, null); state.messages = []; state.lastId = 0; state.view = 'intro'; }
})();

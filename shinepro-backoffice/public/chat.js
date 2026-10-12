/*
 * Shine Pro Cleaning — website chat widget.
 * Add ONE line to every page (before </body>):
 *
 *   <script src="https://YOUR-BACKOFFICE-DOMAIN/chat.js" async></script>
 *
 * The customer leaves their name, email and phone, then chats. Preloaded questions
 * are answered instantly; anything else is answered by the AI assistant, which
 * streams its reply so the first words show up right away.
 *
 * The widget lives in its own Shadow DOM so the website's styles can't hide or
 * break it, and it puts itself back if the page builder removes it.
 */
(function () {
  if (window.__shineproChat) return;
  window.__shineproChat = true;

  var script = document.currentScript;
  var BASE = script && script.src ? new URL(script.src).origin : '';
  var FIREBASE_VERSION = '10.14.1';
  var STORE = 'shinepro_chat_token';
  var OPEN = 'shinepro_chat_open';
  var DEFAULT_PHONE = '(412) 447-8047';

  var state = {
    view: 'details', config: null, configFailed: false, token: null, messages: [], lastId: 0,
    form: {}, pending: null, confirmation: null, busy: false, poll: null, error: null, lastSend: 0,
  };

  // ---------- styles (scoped to the shadow root) ----------
  var css = '' +
    ':host{all:initial;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}[hidden]{display:none!important}' +
    'button{font:inherit;cursor:pointer}a{color:inherit}' +
    '.launch{position:fixed;right:20px;bottom:20px;right:max(20px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));z-index:2147483000;display:flex;align-items:center;gap:10px;background:#1b6f66;color:#fff;border:0;border-radius:999px;padding:14px 22px 14px 18px;font-weight:650;font-size:16px;line-height:1;box-shadow:0 10px 30px rgba(10,40,36,.28);transition:transform .15s,background .15s}' +
    '.launch:hover{background:#145249;transform:translateY(-2px)}.launch:focus-visible{outline:3px solid #f5c542;outline-offset:3px}' +
    '.launch .ic{width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.18);display:grid;place-items:center;font-size:15px}' +
    '.launch .badge{position:absolute;top:-4px;right:-2px;width:14px;height:14px;border-radius:50%;background:#f5c542;border:2px solid #fff}' +
    '.panel{position:fixed;right:20px;bottom:20px;z-index:2147483001;width:400px;max-width:calc(100vw - 40px);height:min(640px,calc(100vh - 40px));background:#fff;border-radius:20px;box-shadow:0 24px 70px rgba(10,40,36,.32);display:flex;flex-direction:column;overflow:hidden;color:#16201e;font-size:15px;line-height:1.45;animation:pop .18s ease-out}' +
    '@keyframes pop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}' +
    '.head{background:#1b6f66;color:#fff;padding:14px 12px 14px 16px;display:flex;align-items:center;gap:12px;flex:none}' +
    '.av{width:40px;height:40px;border-radius:50%;background:#fff;color:#1b6f66;display:grid;place-items:center;font-size:19px;flex:none}' +
    '.who{min-width:0;flex:1}.title{font-weight:700;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sub{font-size:13px;opacity:.92;display:flex;align-items:center;gap:6px;white-space:nowrap}' +
    '.dot{width:8px;height:8px;border-radius:50%;background:#5ee08f;flex:none}' +
    '.hbtns{margin-left:auto;display:flex;gap:4px;align-items:center;flex:none}' +
    '.urgent{flex:none;background:#e3f1ee;color:#145249;font-size:13px;padding:7px 16px;text-align:center}' +
    '.urgent a{font-weight:700;color:#145249;white-space:nowrap}' +
    '.x{background:none;border:0;color:#fff;font-size:26px;padding:2px 8px;line-height:1;border-radius:8px}.x:hover{background:rgba(255,255,255,.14)}' +
    '.body{flex:1;overflow-y:auto;padding:18px 16px;background:#f6f8f7;overscroll-behavior:contain}' +
    'h3{margin:0 0 4px;font-size:18px}p{margin:0}.muted{color:#5f6b69;font-size:13px}' +
    '.card{background:#fff;border:1px solid #e3e8e6;border-radius:16px;padding:16px}' +
    '.btn{display:block;width:100%;border:0;border-radius:12px;padding:13px;font-weight:650;font-size:15px;background:#1b6f66;color:#fff}' +
    '.btn:disabled{opacity:.6;cursor:wait}' +
    '.f{margin-bottom:12px}.f label{display:block;font-size:13px;font-weight:600;margin-bottom:4px}' +
    '.f input,.f textarea{width:100%;font:inherit;font-size:16px;padding:11px 12px;border:1px solid #cfd7d4;border-radius:10px;background:#fff;color:#16201e}' +
    '.f input:focus,.f textarea:focus,.row input:focus{outline:2px solid #1b6f66;outline-offset:-1px;border-color:#1b6f66}' +
    '.f textarea{min-height:90px;resize:vertical}.ck{display:flex;gap:8px;font-size:13px;align-items:flex-start;margin-bottom:12px;color:#3d4846}.ck input{margin-top:3px}' +
    '.err{color:#b3261e;background:#fdecea;border-radius:10px;padding:8px 10px;font-size:14px;margin:4px 0 12px}' +
    '.code{letter-spacing:.3em;text-align:center;font-size:20px!important}' +
    '.picked{background:#e3f1ee;border-radius:10px;padding:8px 10px;font-size:14px;margin-bottom:12px}' +
    '.msgs{display:flex;flex-direction:column;gap:8px}' +
    '.m{max-width:85%;padding:9px 13px;border-radius:18px;white-space:pre-wrap;word-wrap:break-word}' +
    '.m.in{align-self:flex-end;background:#1b6f66;color:#fff;border-bottom-right-radius:5px}' +
    '.m.out{align-self:flex-start;background:#fff;border:1px solid #e3e8e6;border-bottom-left-radius:5px}' +
    '.m.team{background:#eaf0fd;border-color:#d6e0f8}.m small{display:block;font-size:11px;opacity:.7;margin-top:2px}' +
    '.m a{color:inherit;font-weight:600}' +
    '.typing{display:inline-flex;gap:4px;padding:4px 0}.typing i{width:7px;height:7px;border-radius:50%;background:#9aa6a3;animation:b 1s infinite}.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}' +
    '@keyframes b{0%,60%,100%{transform:none;opacity:.5}30%{transform:translateY(-4px);opacity:1}}' +
    '.qs{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:10px}.qs-t{font-size:12px;font-weight:600;color:#5f6b69;text-transform:uppercase;letter-spacing:.04em;margin:14px 0 2px}' +
    '.q{background:#fff;border:1px solid #b9d6d0;color:#145249;border-radius:999px;padding:8px 13px;font-size:14px;font-weight:550;text-align:left}' +
    '.q:hover{background:#e3f1ee;border-color:#1b6f66}.q:disabled{opacity:.5;cursor:default}' +
    '.foot{border-top:1px solid #e3e8e6;padding:10px 12px;padding-bottom:max(10px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:6px;background:#fff;flex:none}' +
    '.row{display:flex;gap:8px}.row input{flex:1;min-width:0;font:inherit;font-size:16px;padding:11px 12px;border:1px solid #cfd7d4;border-radius:12px}' +
    '.send{border:0;border-radius:12px;background:#1b6f66;color:#fff;padding:0 18px;font-weight:650}.send:disabled{opacity:.55}' +
    '.links{display:flex;justify-content:center;gap:14px;font-size:13px}' +
    '.link{background:none;border:0;color:#1b6f66;text-decoration:underline;font-size:13px;padding:2px}' +
    '@media (max-width:600px){' +
      '.panel{inset:0;right:0;bottom:0;width:100%;max-width:none;height:100%;height:100dvh;border-radius:0;animation:none}' +
      '.launch{right:14px;bottom:14px;padding:13px 18px 13px 14px;font-size:15px}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.panel,.launch{animation:none;transition:none}.typing i{animation:none}}';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Escaped text with phone numbers turned into tap-to-call links.
  function rich(s) {
    return esc(s).replace(/\(\d{3}\)\s?\d{3}-\d{4}/g, function (p) { return '<a href="tel:+1' + p.replace(/\D/g, '') + '">' + p + '</a>'; });
  }
  function store(area, k, v) { try { if (v == null) area.removeItem(k); else area.setItem(k, v); } catch (e) {} }
  function load(area, k) { try { return area.getItem(k); } catch (e) { return null; } }
  var local = (function () { try { return window.localStorage; } catch (e) { return null; } })();
  var session = (function () { try { return window.sessionStorage; } catch (e) { return null; } })();
  function phone() { return (state.config && state.config.businessPhone) || DEFAULT_PHONE; }
  function digits(p) { return String(p || '').replace(/\D/g, ''); }

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    return fetch(BASE + '/api/chat' + path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401 && state.token) endSession();
          if (!r.ok) { var e = new Error(d.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; }
          return d;
        });
      });
  }

  // POST a message and read the streamed answer (Server-Sent Events over fetch).
  function streamMessage(body, on) {
    return fetch(BASE + '/api/chat/message?stream=1', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + state.token }, body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok || !r.body) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401) endSession();
          var e = new Error(d.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e;
        });
      }
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = '';
      function pump() {
        return reader.read().then(function (x) {
          if (x.done) return;
          buf += dec.decode(x.value, { stream: true });
          var parts = buf.split('\n\n');
          buf = parts.pop();
          parts.forEach(function (chunk) {
            var ev = 'message', data = '';
            chunk.split('\n').forEach(function (line) {
              if (line.indexOf('event: ') === 0) ev = line.slice(7);
              else if (line.indexOf('data: ') === 0) data += line.slice(6);
            });
            if (data && on[ev]) on[ev](JSON.parse(data));
          });
          return pump();
        });
      }
      return pump();
    });
  }

  // ---------- phone codes (only when the back office uses CHAT_VERIFICATION=codes) ----------
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
  var host = document.createElement('div');
  host.id = 'shinepro-chat';
  host.setAttribute('style', 'position:static!important;display:block!important;visibility:visible!important;opacity:1!important');
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  var style = document.createElement('style');
  style.textContent = css;
  var launcher = document.createElement('button');
  launcher.className = 'launch';
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Chat with us');
  launcher.innerHTML = '<span class="ic" aria-hidden="true">💬</span>Chat With Us<span class="badge" aria-hidden="true"></span>';
  var panel = document.createElement('div');
  panel.className = 'panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Chat with Shine Pro Cleaning');
  root.appendChild(style);
  root.appendChild(launcher);
  root.appendChild(panel);
  // Firebase's invisible reCAPTCHA must live in the page itself, not the shadow root.
  var recaptchaBox = document.createElement('div');
  recaptchaBox.id = 'shinepro-recaptcha';

  function mount() {
    if (!document.body) return;
    if (!host.isConnected) document.body.appendChild(host);
    if (!recaptchaBox.isConnected) document.body.appendChild(recaptchaBox);
  }
  function boot() {
    mount();
    // Some site builders re-render the page and drop elements they don't know.
    // Put the chat back whenever that happens so it never disappears.
    if (window.MutationObserver) new MutationObserver(function () { if (!host.isConnected) mount(); }).observe(document.body, { childList: true });
    state.token = load(local, STORE);
    loadConfig();
    if (load(session, OPEN) === '1') open();
  }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);

  launcher.onclick = open;
  function loadConfig() {
    if (state.config || state.loadingConfig) return;
    state.loadingConfig = true;
    api('/config').then(function (c) {
      state.config = c;
      if (!c.enabled) state.view = 'unavailable';
      else if (state.token) { state.view = 'chat'; fetchMessages(); }
      else state.view = 'details';
      if (!panel.hidden) render();
    }).catch(function () {
      state.configFailed = true; state.view = 'unavailable';
      if (!panel.hidden) render();
    }).then(function () { state.loadingConfig = false; });
  }
  function open() {
    launcher.hidden = true; panel.hidden = false;
    store(session, OPEN, '1');
    if (!state.config) { state.configFailed = false; loadConfig(); }
    render();
    startPolling();
  }
  function close() {
    panel.hidden = true; launcher.hidden = false;
    store(session, OPEN, null);
    stopPolling();
    launcher.focus();
  }

  function header() {
    var p = phone();
    return '<div class="head"><div class="av" aria-hidden="true">✨</div><div class="who"><div class="title">PGH Shine Pro</div>' +
      '<div class="sub"><span class="dot"></span>We reply instantly</div></div>' +
      '<div class="hbtns"><button class="x" type="button" data-close aria-label="Close chat">×</button></div></div>' +
      '<div class="urgent">Urgent? Call or text <a href="tel:+1' + digits(p) + '">' + esc(p) + '</a></div>';
  }

  function questions() { return (state.config && state.config.questions) || []; }
  function chips(list, attr) {
    return '<div class="qs">' + list.map(function (q) {
      return '<button class="q" type="button" ' + attr + '="' + esc(q.id) + '"' + (state.busy ? ' disabled' : '') + '>' + esc(q.label) + '</button>';
    }).join('') + '</div>';
  }

  function render() {
    var v = state.view, body = '', foot = '';
    var p = phone();
    var draft = root.querySelector && root.querySelector('.foot input[name=message]');
    var draftText = state.draft || (draft ? draft.value : '');
    state.draft = null;
    if (!state.config && !state.configFailed) {
      body = '<p class="muted" style="text-align:center;margin-top:40%">Loading…</p>';
    } else if (v === 'unavailable') {
      body = '<div class="card" style="text-align:center"><h3>We\'d love to help</h3>' +
        '<p>Chat is offline for a moment. Please call or text us at <a href="tel:+1' + digits(p) + '"><strong>' + esc(p) + '</strong></a>.</p></div>';
    } else if (v === 'details') {
      var f = state.form;
      var picked = state.pending && byId(state.pending);
      body = '<form novalidate data-form="details" class="card"><h3>Hi! 👋</h3><p class="muted" style="margin-bottom:14px">Before we start, please tell us how to reach you.</p>' +
        (picked ? '<div class="picked">Your question: <strong>' + esc(picked.label) + '</strong></div>' : '') +
        field('name', 'Name', 'text', f.name, 'autocomplete="name" required') +
        field('email', 'Email', 'email', f.email, 'autocomplete="email" inputmode="email" required') +
        field('phone', 'Phone', 'tel', f.phone, 'autocomplete="tel" inputmode="tel" required placeholder="(412) 555-0123"') +
        '<label class="ck"><input type="checkbox" name="marketing_opt_in"' + (f.marketing_opt_in !== false ? ' checked' : '') + '> Send me occasional discounts. Unsubscribe anytime.</label>' +
        err() + '<button class="btn" type="submit"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Starting…' : 'Start chat') + '</button></form>' +
        (picked ? '' : '<div class="qs-t">Popular questions</div>' + chips(questions(), 'data-pick'));
    } else if (v === 'codes') {
      var needPhone = state.config.phoneVerification;
      body = '<form novalidate data-form="codes" class="card"><h3>Enter your codes</h3>' +
        field('email_code', 'Code sent to ' + esc(state.form.email), 'text', '', 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" class="code" required') +
        (needPhone ? field('phone_code', 'Code texted to ' + esc(state.form.phone), 'text', '', 'inputmode="numeric" autocomplete="one-time-code" maxlength="6" class="code" required') : '') +
        err() + '<button class="btn" type="submit"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Verifying…' : 'Verify & start chat') + '</button>' +
        '<p style="margin-top:12px;text-align:center"><button class="link" type="button" data-go="details">Wrong info or no code? Go back</button></p></form>';
    } else if (v === 'chat') {
      var asked = state.messages.some(function (m) { return m.direction === 'in'; });
      body = '<div class="msgs" aria-live="polite">' + state.messages.map(msgHtml).join('') + '</div>' +
        (asked ? '' : '<div class="qs-t">Popular questions</div>' + chips(questions(), 'data-ask')) + err();
      foot = '<form novalidate class="row" data-form="msg"><input name="message" placeholder="Type your question…" autocomplete="off" enterkeyhint="send" maxlength="1000" aria-label="Message">' +
        '<button class="send" type="submit"' + (state.busy ? ' disabled' : '') + '>Send</button></form>' +
        '<div class="links"><button class="link" type="button" data-go="callback">Request a call back</button></div>';
    } else if (v === 'callback') {
      body = '<form novalidate data-form="callback" class="card"><h3>Request a call back</h3><p class="muted" style="margin-bottom:14px">Leave a note and we\'ll call you as soon as possible.</p>' +
        '<div class="f"><label for="spc-note">What can we help with?</label><textarea id="spc-note" name="note" required placeholder="e.g. Deep clean for a 3 bed / 2 bath before we move out on the 15th"></textarea></div>' +
        field('best_time', 'Best time to call (optional)', 'text', '', 'placeholder="e.g. weekdays after 5pm"') +
        err() + '<button class="btn" type="submit"' + (state.busy ? ' disabled' : '') + '>Send request</button>' +
        '<p style="margin-top:12px;text-align:center"><button class="link" type="button" data-go="chat">Back to chat</button></p></form>';
    }
    panel.innerHTML = header() + '<div class="body">' + body + '</div>' + (foot ? '<div class="foot">' + foot + '</div>' : '');
    bind();
    var input = panel.querySelector('.foot input[name=message]');
    if (input && draftText) input.value = draftText;
    scrollDown();
  }
  function scrollDown() {
    var b = panel.querySelector('.body');
    if (b && state.view === 'chat') b.scrollTop = b.scrollHeight;
  }

  function byId(id) { var l = questions(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function field(name, label, type, value, attrs) {
    return '<div class="f"><label for="spc-' + name + '">' + label + '</label><input id="spc-' + name + '" name="' + name + '" type="' + type + '" value="' + esc(value || '') + '" ' + (attrs || '') + '></div>';
  }
  function err() { return state.error ? '<div class="err" role="alert">' + esc(state.error) + '</div>' : ''; }
  function msgHtml(m) {
    var cls = m.direction === 'in' ? 'in' : 'out' + (m.status === 'sent' ? ' team' : '');
    var inner = m.typing && !m.body ? '<span class="typing" aria-label="Typing"><i></i><i></i><i></i></span>' : rich(m.body);
    return '<div class="m ' + cls + '" data-key="' + m.key + '">' + inner + (m.status === 'sent' ? '<small>Shine Pro team</small>' : '') + '</div>';
  }
  // Update one message bubble in place (used while an answer streams in).
  function paint(m) {
    var el = panel.querySelector('[data-key="' + m.key + '"]');
    if (!el) return render();
    el.innerHTML = m.body ? rich(m.body) : '<span class="typing" aria-label="Typing"><i></i><i></i><i></i></span>';
    scrollDown();
  }

  function bind() {
    panel.querySelector('[data-close]').onclick = close;
    Array.prototype.forEach.call(panel.querySelectorAll('[data-go]'), function (b) {
      b.onclick = function () { state.error = null; state.view = b.getAttribute('data-go'); render(); };
    });
    Array.prototype.forEach.call(panel.querySelectorAll('[data-pick]'), function (b) {
      b.onclick = function () {
        state.form = values(panel.querySelector('form[data-form=details]'));
        state.pending = b.getAttribute('data-pick'); render();
        var first = panel.querySelector('input[name=name]');
        if (first) first.focus();
      };
    });
    Array.prototype.forEach.call(panel.querySelectorAll('[data-ask]'), function (b) {
      b.onclick = function () { ask({ question_id: b.getAttribute('data-ask') }); };
    });
    var form = panel.querySelector('form');
    var forms = panel.querySelectorAll('form');
    Array.prototype.forEach.call(forms, function (fm) {
      fm.onsubmit = function (e) { e.preventDefault(); submit(fm.getAttribute('data-form'), fm); };
    });
    var first = panel.querySelector('.body input:not([type=checkbox]), .body textarea, .foot input');
    if (form && first && !('ontouchstart' in window) && !state.busy) first.focus();
  }

  function values(form) {
    var o = {};
    if (!form) return o;
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name) o[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
    return o;
  }
  function toE164(p) {
    var d = digits(p);
    if (d.length === 10) return '+1' + d;
    if (d.length === 11 && d.charAt(0) === '1') return '+' + d;
    return null;
  }
  function fail(e) { state.busy = false; state.error = e && e.message ? e.message : String(e); render(); }

  var keySeq = 0;
  function keyed(m) { m.key = m.key || 'k' + (++keySeq); return m; }

  // Send a typed message or a preloaded question and show the answer as it arrives.
  function ask(msg) {
    if (state.busy) return;
    var preset = msg.question_id ? byId(msg.question_id) : null;
    var mine = keyed({ id: 0, direction: 'in', body: preset ? preset.label : msg.message });
    var reply = keyed({ id: 0, direction: 'out', body: '', typing: true });
    state.error = null;
    state.messages.push(mine, reply);
    state.busy = true;
    render();
    // Preloaded questions are answered instantly; the server just saves them.
    if (preset) { reply.body = preset.answer; reply.typing = false; paint(reply); }
    var wait = Math.max(0, state.lastSend + 1100 - Date.now()); // server allows one message per second
    var body = preset ? { question_id: preset.id } : { message: msg.message };
    var canStream = !preset && window.ReadableStream && window.TextDecoder;
    setTimeout(function () {
      state.lastSend = Date.now();
      var done = function (saved) {
        mine.id = saved.mine.id; reply.id = saved.reply.id; reply.body = saved.reply.body; reply.status = saved.reply.status; reply.typing = false;
        state.lastId = lastId([saved.mine, saved.reply]);
        state.busy = false; render();
      };
      var req = canStream
        ? new Promise(function (resolve, reject) {
            var saved = {};
            streamMessage(body, {
              mine: function (m) { saved.mine = m; },
              delta: function (d) { reply.typing = false; reply.body += d.text; paint(reply); },
              done: function (m) { saved.reply = m; },
            }).then(function () { if (saved.reply) resolve(saved); else reject(new Error('The answer was cut off.')); }, reject);
          })
        : api('/message', { method: 'POST', body: body }).then(function (d) { return { mine: d.messages[0], reply: d.messages[1] }; });
      req.then(done).catch(function (e) {
        // Take the unsent message back out and put it in the box so it can be re-sent.
        state.messages = state.messages.filter(function (m) { return m !== mine && m !== reply; });
        if (!preset) state.draft = msg.message;
        fail(new Error((e.status ? e.message : 'We couldn\'t send that.') + ' You can also call or text ' + phone() + '.'));
      });
    }, wait);
  }

  function submit(kind, form) {
    var v = values(form);
    state.error = null;
    if (kind === 'details') {
      state.form = v;
      if (!v.name) return fail('Please enter your name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return fail('Please enter a valid email address.');
      var e164 = toE164(v.phone);
      if (!e164) return fail('Please enter a valid 10-digit phone number.');
      state.busy = true; render();
      if (state.config.verification !== 'codes') return startChat({});
      var phoneStep = state.config.phoneVerification
        ? firebaseAuth().then(function (auth) {
            if (state.recaptcha) { try { state.recaptcha.clear(); } catch (x) {} }
            state.recaptcha = new window.firebase.auth.RecaptchaVerifier(recaptchaBox, { size: 'invisible' }, auth.app);
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
        if (fbAuth) fbAuth.signOut().catch(function () {});
        return startChat({ email_code: v.email_code, phone_token: phoneToken });
      }).catch(fail);
    } else if (kind === 'msg') {
      var input = form.querySelector('input[name=message]');
      if (!v.message || state.busy) return;
      input.value = '';
      ask({ message: v.message });
    } else if (kind === 'callback') {
      if (!v.note) return fail('Please add a short note so we know how to help.');
      state.busy = true; render();
      api('/callback', { method: 'POST', body: v }).then(function (d) {
        addMessages(d.messages); state.busy = false; state.view = 'chat'; render();
        trackLead('callback_request');
      }).catch(fail);
    }
  }

  function startChat(extra) {
    var f = state.form;
    return api('/start', { method: 'POST', body: {
      name: f.name, email: f.email, phone: f.phone, marketing_opt_in: f.marketing_opt_in,
      email_code: extra.email_code, phone_token: extra.phone_token,
    } }).then(function (d) {
      state.token = d.token; store(local, STORE, d.token);
      state.messages = []; addMessages(d.messages);
      state.busy = false; state.view = 'chat'; render(); startPolling();
      trackLead('chat_started');
      var picked = state.pending; state.pending = null;
      if (picked) ask({ question_id: picked });
    }).catch(fail);
  }

  // Lead tracking for Google Analytics 4 / Google Ads / Meta, if the website has them installed.
  function trackLead(kind) {
    try {
      if (window.gtag) window.gtag('event', 'generate_lead', { lead_source: kind });
      if (window.dataLayer) window.dataLayer.push({ event: 'shinepro_' + kind });
      if (window.fbq) window.fbq('track', 'Lead', { content_name: kind });
    } catch (e) {}
  }

  function lastId(list) { return list.reduce(function (m, x) { return Math.max(m, x.id || 0); }, state.lastId || 0); }
  function addMessages(list) {
    list.forEach(function (m) { if (!state.messages.some(function (x) { return x.id && x.id === m.id; })) state.messages.push(keyed(m)); });
    state.lastId = lastId(list);
  }
  function fetchMessages() {
    if (!state.token) return;
    api('/messages?after=' + state.lastId).then(function (list) {
      if (list.length) { addMessages(list); if (state.view === 'chat' && !state.busy && !panel.hidden) render(); }
    }).catch(function () { if (!state.token && !panel.hidden) render(); }); // session expired -> back to start
  }
  function startPolling() { stopPolling(); state.poll = setInterval(function () { if (!panel.hidden && state.view === 'chat' && !state.busy) fetchMessages(); }, 5000); }
  function stopPolling() { if (state.poll) clearInterval(state.poll); state.poll = null; }
  function endSession() { state.token = null; store(local, STORE, null); state.messages = []; state.lastId = 0; state.view = 'details'; }
})();

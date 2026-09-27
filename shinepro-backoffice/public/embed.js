/*
 * Shine Pro Cleaning — embeddable instant-quote form.
 * Put this on ANY page of your website:
 *
 *   <div id="shinepro-quote"></div>
 *   <script src="https://YOUR-BACKOFFICE-DOMAIN/embed.js" async></script>
 *
 * Every submission is saved as a lead in the admin and triggers your email/text alerts.
 */
(function () {
  var script = document.currentScript;
  var BASE = script && script.src ? new URL(script.src).origin : '';
  var PHONE = (script && script.getAttribute('data-phone')) || '(412) 447-8047';
  var mount = document.getElementById('shinepro-quote');
  if (!mount) return;

  var css = '' +
    '.spq{font-family:inherit;max-width:640px;background:#fff;border:1px solid #e3e6e5;border-radius:16px;padding:20px;color:#16201e;box-sizing:border-box}' +
    '.spq *{box-sizing:border-box}.spq .g{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}@media(max-width:560px){.spq .g{grid-template-columns:1fr}}' +
    '.spq .f{margin-bottom:12px}.spq .full{grid-column:1/-1}.spq label{display:block;font-size:.88rem;font-weight:600;margin-bottom:4px}' +
    '.spq input,.spq select,.spq textarea{width:100%;font:inherit;padding:10px 12px;border:1px solid #cfd5d4;border-radius:10px;background:#fff;color:#16201e}' +
    '.spq textarea{min-height:80px}.spq .ck{display:flex;gap:8px;align-items:flex-start;font-weight:500;font-size:.88rem}.spq .ck input{width:auto;margin-top:3px}' +
    '.spq .price{background:#e3f1ee;border-radius:14px;padding:14px;text-align:center;margin:4px 0 16px}.spq .amt{font-size:2.1rem;font-weight:800;color:#1b6f66}' +
    '.spq button{width:100%;border:0;border-radius:10px;padding:14px;font:inherit;font-weight:700;font-size:1.05rem;background:#1b6f66;color:#fff;cursor:pointer}' +
    '.spq button:disabled{opacity:.6;cursor:wait}.spq .err{color:#c0392b;margin:8px 0}.spq .hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}' +
    '.spq .ok{text-align:center;padding:20px}.spq .ok h3{margin:8px 0}.spq .muted{color:#66716f;font-size:.85rem}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function opt(obj) {
    return Object.keys(obj).map(function (k) { return '<option value="' + k + '">' + obj[k].label + '</option>'; }).join('');
  }

  function load(src, cb) {
    if (window.ShinePricing) return cb();
    var s = document.createElement('script');
    s.src = src; s.onload = cb;
    s.onerror = function () { mount.innerHTML = '<p>Quote form failed to load. Please call or text us.</p>'; };
    document.head.appendChild(s);
  }

  load(BASE + '/pricing.js', function () {
    var P = window.ShinePricing.PRICING;
    var nums = function (n) { return Array.apply(null, Array(n)).map(function (_, i) { return '<option>' + (i + 1) + '</option>'; }).join(''); };
    mount.innerHTML = '<form class="spq" novalidate>' +
      '<div class="g">' +
      '<div class="f full"><label>Type of cleaning</label><select name="service_type">' + opt(P.services) + '</select></div>' +
      '<div class="f"><label>Bedrooms</label><select name="bedrooms">' + nums(8).replace('<option>2</option>', '<option selected>2</option>') + '</select></div>' +
      '<div class="f"><label>Bathrooms</label><select name="bathrooms"><option>1</option><option>1.5</option><option selected>2</option><option>2.5</option><option>3</option><option>3.5</option><option>4</option><option>5</option><option>6</option></select></div>' +
      '<div class="f"><label>Square feet (approx.)</label><input name="sqft" type="number" min="0" step="100" placeholder="1500"></div>' +
      '<div class="f"><label>How often?</label><select name="frequency">' + opt(P.frequency) + '</select></div>' +
      '</div>' +
      '<div class="price"><div class="muted">Your estimated price</div><div class="amt" data-price>$—</div><div class="muted" data-freq></div></div>' +
      '<div class="g">' +
      '<div class="f"><label>Your name *</label><input name="name" autocomplete="name" required></div>' +
      '<div class="f"><label>Phone *</label><input name="phone" type="tel" autocomplete="tel" required></div>' +
      '<div class="f full"><label>Email *</label><input name="email" type="email" autocomplete="email" required></div>' +
      '<div class="f"><label>Street address</label><input name="address" autocomplete="street-address"></div>' +
      '<div class="f"><label>ZIP</label><input name="zip" autocomplete="postal-code" inputmode="numeric"></div>' +
      '<div class="f full"><label>Preferred date</label><input name="preferred_date" type="date"></div>' +
      '<div class="f full"><label>Anything we should know?</label><textarea name="message" placeholder="Pets, focus areas, parking…"></textarea></div>' +
      '<div class="f full"><label class="ck"><input type="checkbox" name="marketing_opt_in" checked> Send me occasional discounts and updates by email/text. Unsubscribe anytime.</label></div>' +
      '</div>' +
      '<div class="hp" aria-hidden="true"><label>Company website<input name="company_website" tabindex="-1" autocomplete="off"></label></div>' +
      '<div class="err" data-err hidden></div>' +
      '<button type="submit">Get My Quote</button>' +
      '<p class="muted" style="text-align:center">By submitting you agree to be contacted about your quote.<br>Questions? Call or text <a href="tel:' + PHONE.replace(/\D/g, '') + '">' + PHONE + '</a></p>' +
      '</form>';

    var form = mount.querySelector('form');
    var priceEl = form.querySelector('[data-price]');
    var freqEl = form.querySelector('[data-freq]');
    var errEl = form.querySelector('[data-err]');

    function values() {
      var o = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name) return;
        o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      return o;
    }
    function update() {
      var v = values();
      var price = window.ShinePricing.estimatePrice(v);
      priceEl.textContent = price != null ? '$' + price : '$—';
      var f = P.frequency[v.frequency];
      freqEl.textContent = f && f.discount ? f.label + ' — ' + Math.round(f.discount * 100) + '% off each visit' : 'per visit';
    }
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = values();
      v.source = 'embed';
      v.estimated_price = window.ShinePricing.estimatePrice(v);
      errEl.hidden = true;
      if (!v.name.trim()) return showErr('Please enter your name.');
      if (v.phone.replace(/\D/g, '').length < 10) return showErr('Please enter your phone number (with area code).');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return showErr('Please enter a valid email address.');
      var btn = form.querySelector('button');
      btn.disabled = true; btn.textContent = 'Sending…';
      fetch(BASE + '/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d.error || 'Something went wrong');
          mount.innerHTML = '<div class="spq"><div class="ok"><div style="font-size:2.5rem">✨</div><h3>Thank you, ' + escapeHtml(v.name.split(' ')[0]) + '!</h3>' +
            (res.d.estimated_price != null ? '<p>Your estimated price is <strong>$' + res.d.estimated_price + '</strong>.</p>' : '') +
            '<p>We received your request and will contact you shortly to confirm.</p><p class="muted">Need us sooner? Call or text ' + PHONE + '</p></div></div>';
          if (window.gtag) window.gtag('event', 'generate_lead', { value: res.d.estimated_price, currency: 'USD' });
          if (window.fbq) window.fbq('track', 'Lead');
        })
        .catch(function (err) {
          showErr(err.message === 'Failed to fetch' ? 'Connection problem — please try again or call us.' : err.message);
          btn.disabled = false; btn.textContent = 'Get My Quote';
        });
    });
    function showErr(m) { errEl.textContent = m; errEl.hidden = false; }
    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  });
})();

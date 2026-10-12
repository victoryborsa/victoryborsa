/*
 * Shine Pro Cleaning — embeddable instant-estimate form.
 * Put this on ANY page of your website:
 *
 *   <div id="shinepro-quote"></div>
 *   <script src="https://YOUR-BACKOFFICE-DOMAIN/embed.js" async></script>
 *
 * Prices come from /pricing.js (the one price list). The estimate shown here is only a preview:
 * the server prices every request again and saves the lead with its itemized estimate.
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
    '.spq .addons{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px}@media(max-width:560px){.spq .addons{grid-template-columns:1fr}}' +
    '.spq .inc{color:#1b6f66;font-size:.8rem;font-weight:700}.spq .radios{display:flex;gap:16px;flex-wrap:wrap}.spq .radios label{display:flex;gap:6px;align-items:center;font-weight:500}.spq .radios input{width:auto}' +
    '.spq .sum{background:#e3f1ee;border-radius:14px;padding:14px;margin:4px 0 16px}.spq .sum table{width:100%;border-collapse:collapse;font-size:.92rem}' +
    '.spq .sum td{padding:3px 0}.spq .sum td.n{text-align:right;white-space:nowrap;padding-left:10px}.spq .sum tr.t td{font-weight:800;font-size:1.25rem;color:#1b6f66;border-top:1px solid #b9dcd5;padding-top:8px}' +
    '.spq .note{background:#fff7e0;border-radius:10px;padding:10px 12px;font-size:.9rem;margin:0 0 12px}' +
    '.spq button{width:100%;border:0;border-radius:10px;padding:14px;font:inherit;font-weight:700;font-size:1.05rem;background:#1b6f66;color:#fff;cursor:pointer}' +
    '.spq button:disabled{opacity:.6;cursor:wait}.spq .err{color:#c0392b;margin:8px 0}.spq .hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}' +
    '.spq .ok{text-align:center;padding:20px}.spq .ok h3{margin:8px 0}.spq .muted{color:#66716f;font-size:.85rem}.spq [hidden]{display:none!important}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function newRequestId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function load(src, cb) {
    if (window.ShinePricing) return cb();
    var s = document.createElement('script');
    s.src = src; s.onload = cb;
    s.onerror = function () { mount.innerHTML = '<p>Estimate form failed to load. Please call or text us at ' + PHONE + '.</p>'; };
    document.head.appendChild(s);
  }

  load(BASE + '/pricing.js', function () {
    var SP = window.ShinePricing;
    var P = SP.PRICING;
    var money = SP.money;
    var serviceIds = Object.keys(P.services).filter(function (k) { return !P.services[k].quoteOnly; }); // priced services only
    var requestId = newRequestId(); // reused if the visitor presses submit again, so it is saved once

    mount.innerHTML = '<form class="spq" novalidate>' +
      '<div class="g">' +
      '<div class="f"><label>Type of cleaning</label><select name="service_type">' + serviceIds.map(function (k) { return '<option value="' + k + '">' + escapeHtml(P.services[k].label) + '</option>'; }).join('') + '</select></div>' +
      '<div class="f"><label>Home size</label><select name="bedrooms">' + P.sizes.map(function (s) { return '<option value="' + s.id + '"' + (s.id === '2' ? ' selected' : '') + '>' + escapeHtml(s.label) + '</option>'; }).join('') + '</select></div>' +
      '<div class="f full" data-freq-field hidden><label>How often?</label><select name="frequency">' + Object.keys(P.frequency).filter(function (k) { return k !== 'once'; }).map(function (k) { return '<option value="' + k + '">' + escapeHtml(P.frequency[k].label) + ' (' + Math.round(P.frequency[k].discount * 100) + '% off cleaning)</option>'; }).join('') + '</select></div>' +
      '<div class="f full"><label>Add-ons</label><div class="addons">' + P.addons.map(function (a) {
        return '<label class="ck" data-addon="' + a.id + '"><input type="checkbox" name="addons" value="' + a.id + '"> <span>' + escapeHtml(a.label) + ' <span class="muted" data-addon-price>' + money(a.price) + (a.perHour ? '/hr' : '') + '</span><span class="inc" data-addon-inc hidden>Included</span></span></label>';
      }).join('') + '</div></div>' +
      '<div class="f" data-hours-field hidden><label>Organizing hours</label><input name="organizing_hours" type="number" min="1" max="8" value="2"></div>' +
      '</div>' +
      '<div class="sum" aria-live="polite"><div class="muted">Your estimate</div><table data-lines></table></div>' +
      '<div class="g">' +
      '<div class="f"><label>Your name *</label><input name="name" autocomplete="name" required></div>' +
      '<div class="f"><label>Phone</label><input name="phone" type="tel" autocomplete="tel"></div>' +
      '<div class="f full"><label>Email</label><input name="email" type="email" autocomplete="email"></div>' +
      '<div class="f full"><label>How should we contact you?</label><div class="radios">' +
        '<label><input type="radio" name="preferred_contact" value="phone" checked> Call</label>' +
        '<label><input type="radio" name="preferred_contact" value="text"> Text</label>' +
        '<label><input type="radio" name="preferred_contact" value="email"> Email</label></div>' +
        '<div class="muted">We need a phone number or an email address (the one you choose here).</div></div>' +
      '<div class="f"><label>Street address</label><input name="address" autocomplete="street-address"></div>' +
      '<div class="f"><label>ZIP</label><input name="zip" autocomplete="postal-code" inputmode="numeric"></div>' +
      '<div class="f"><label>Preferred date</label><input name="preferred_date" type="date"></div>' +
      '<div class="f"><label>Preferred time</label><input name="preferred_time" placeholder="Morning, 10am…"></div>' +
      '<div class="f full"><label>Anything we should know?</label><textarea name="message" placeholder="Pets, focus areas, parking…"></textarea></div>' +
      '<div class="f full"><label class="ck"><input type="checkbox" name="marketing_opt_in"> Yes, send me occasional offers and news by email or text. (Optional. You can unsubscribe anytime. We will contact you about this estimate either way.)</label></div>' +
      '</div>' +
      '<div class="hp" aria-hidden="true"><label>Company website<input name="company_website" tabindex="-1" autocomplete="off"></label></div>' +
      '<p class="note">A ' + money(P.travelFee) + ' travel fee is added to every visit. This is an estimate, not a booking: your appointment is confirmed when we contact you to confirm the date and time.</p>' +
      '<div class="err" data-err hidden></div>' +
      '<button type="submit">Request My Estimate</button>' +
      '<p class="muted" style="text-align:center">Questions? Call or text <a href="tel:' + PHONE.replace(/\D/g, '') + '">' + PHONE + '</a></p>' +
      '</form>';

    var form = mount.querySelector('form');
    var linesEl = form.querySelector('[data-lines]');
    var errEl = form.querySelector('[data-err]');

    function values() {
      var o = { addons: [] };
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name) return;
        if (el.name === 'addons') { if (el.checked) o.addons.push(el.value); return; }
        if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; return; }
        o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      return o;
    }
    function lineAmount(l) {
      if (l.kind === 'included') return 'Included';
      if (l.kind === 'discount') return '−' + money(Math.abs(l.amount));
      return money(l.amount);
    }
    function update() {
      var v = values();
      var service = P.services[v.service_type];
      form.querySelector('[data-freq-field]').hidden = !service.recurring;
      form.querySelector('[data-hours-field]').hidden = v.addons.indexOf('organizing') === -1;
      Array.prototype.forEach.call(form.querySelectorAll('[data-addon]'), function (row) {
        var included = service.included.indexOf(row.getAttribute('data-addon')) !== -1;
        var box = row.querySelector('input');
        row.querySelector('[data-addon-inc]').hidden = !included;
        row.querySelector('[data-addon-price]').hidden = included;
        box.disabled = included;
        if (included) box.checked = true;
      });
      var q = SP.quote({ service: v.service_type, size: v.bedrooms, frequency: service.recurring ? v.frequency : 'once', addons: v.addons, organizingHours: v.organizing_hours });
      if (!q) { linesEl.innerHTML = ''; return; }
      var rows = q.lines.map(function (l) { return '<tr><td>' + escapeHtml(l.label) + '</td><td class="n">' + (l.kind === 'travel' ? '' : lineAmount(l)) + '</td></tr>'; });
      rows.push('<tr class="t"><td>Total' + (q.unit === 'turn' ? ' per turnover' : ' per visit') + '</td><td class="n">' + (q.quoteOnly ? 'Custom quote' : money(q.total)) + '</td></tr>');
      linesEl.innerHTML = rows.join('');
    }
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = values();
      var service = P.services[v.service_type];
      errEl.hidden = true;
      if (!v.name.trim()) return showErr('Please enter your name.');
      var hasPhone = v.phone.replace(/\D/g, '').length >= 10;
      var hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim());
      if (v.phone.trim() && !hasPhone) return showErr('Please enter your phone number with the area code.');
      if (v.email.trim() && !hasEmail) return showErr('Please enter a valid email address.');
      if (!hasPhone && !hasEmail) return showErr('Please enter a phone number or an email address so we can reach you.');
      if (v.preferred_contact === 'email' && !hasEmail) return showErr('Please enter your email address, or choose call or text.');
      if (v.preferred_contact !== 'email' && !hasPhone) return showErr('Please enter your phone number, or choose email.');
      var body = {
        name: v.name, phone: v.phone, email: v.email, preferred_contact: v.preferred_contact,
        address: v.address, zip: v.zip, preferred_date: v.preferred_date, preferred_time: v.preferred_time, message: v.message,
        service_type: v.service_type, bedrooms: v.bedrooms, frequency: service.recurring ? v.frequency : 'once',
        addons: v.addons,
        organizing_hours: v.addons.indexOf('organizing') !== -1 ? Number(v.organizing_hours) || 1 : undefined,
        marketing_opt_in: v.marketing_opt_in === true, company_website: v.company_website,
        request_id: requestId, source: 'embed',
      };
      var btn = form.querySelector('button');
      btn.disabled = true; btn.textContent = 'Sending…';
      fetch(BASE + '/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d.error || 'Something went wrong');
          var q = res.d.quote;
          var summary = q && q.lines ? '<table style="margin:10px auto;text-align:left">' + q.lines.map(function (l) { return '<tr><td>' + escapeHtml(l.label) + '</td><td style="text-align:right;padding-left:12px">' + (l.kind === 'travel' ? '' : lineAmount(l)) + '</td></tr>'; }).join('') +
            '<tr><td><strong>Total</strong></td><td style="text-align:right;padding-left:12px"><strong>' + (q.total != null ? money(q.total) : 'Custom quote') + '</strong></td></tr></table>' : '';
          mount.innerHTML = '<div class="spq"><div class="ok"><div style="font-size:2.5rem">✨</div><h3>Thank you, ' + escapeHtml(v.name.split(' ')[0]) + '!</h3>' +
            summary + '<p>This is an estimate, not a booking. Your appointment is confirmed when we contact you to confirm the date and time.</p>' +
            '<p class="muted">Need us sooner? Call or text ' + PHONE + '</p></div></div>';
          if (window.gtag) window.gtag('event', 'generate_lead', { value: res.d.estimated_price, currency: 'USD' });
          if (window.fbq) window.fbq('track', 'Lead');
        })
        .catch(function (err) {
          showErr(err.message === 'Failed to fetch' ? 'Connection problem — please try again or call us.' : err.message);
          btn.disabled = false; btn.textContent = 'Request My Estimate';
        });
    });
    function showErr(m) { errEl.textContent = m; errEl.hidden = false; }
  });
})();

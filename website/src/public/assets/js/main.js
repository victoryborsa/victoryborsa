/* Shared behaviour for every page: menus, price helpers, form sending, ZIP check. */
(function () {
  var cfg = window.SHINE;
  var $ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /* ---------- Pricing ---------- */
  // Every price comes from pricing.js (window.ShinePricing), the one price list
  // shared with the back office. Nothing here holds a price of its own.

  var SP = window.ShinePricing;
  var PR = SP.PRICING;
  var money = SP.money;

  // Services in the order the site lists them, as [{id, label, ...}].
  function serviceList(filter) {
    return Object.keys(PR.services)
      .map(function (id) { return Object.assign({ id: id }, PR.services[id]); })
      .filter(filter || function () { return true; });
  }

  function findById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }

  function fillSelect(sel, list, selected) {
    sel.innerHTML = list
      .map(function (o) {
        return '<option value="' + o.id + '"' + (o.id === selected ? " selected" : "") + ">" + o.label + "</option>";
      })
      .join("");
  }

  // Itemized estimate as HTML rows: one line per item, the travel fee on its own
  // line, then the total.
  function quoteRows(q) {
    if (!q) return "";
    var rows = q.lines.map(function (l) {
      var amt = l.kind === "included" ? "Included" : l.amount < 0 ? "−" + money(-l.amount) : money(l.amount);
      var label = l.kind === "travel" ? PR.travelFeeLabel : l.kind === "included" ? l.label.replace(/ — included$/, "") : l.label;
      return '<li class="q-line q-' + l.kind + '"><span>' + label + "</span><span>" + amt + "</span></li>";
    });
    rows.push('<li class="q-line q-total"><span>Estimated total' + (q.quoteOnly ? "" : q.unit === "turn" ? " per turn" : " per visit") +
      "</span><span>" + (q.quoteOnly ? "Custom quote" : money(q.total)) + "</span></li>");
    return rows.join("");
  }

  /* ---------- Sending requests ---------- */

  function newRequestId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  // One id per form fill, reused if the visitor presses Send again or we retry,
  // so the back office never saves the same request twice.
  function requestId(form) {
    if (!form._requestId) form._requestId = newRequestId();
    return form._requestId;
  }

  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // POSTs JSON; retries network errors and server errors (not mistakes in the
  // form) up to `tries` times. Rejects with an Error whose message can be shown.
  function postJson(url, body, tries) {
    var retry = function (err) {
      if (tries > 1) return wait(1200).then(function () { return postJson(url, body, tries - 1); });
      throw err;
    };
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    }).then(
      function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (r.ok) return data;
          var err = new Error(data.error || "We couldn't send your request.");
          err.status = r.status;
          if (r.status >= 500) return retry(err);
          throw err;
        });
      },
      function () {
        return retry(new Error("We couldn't reach our booking system. Please check your connection and try again."));
      }
    );
  }

  // Sends a request. With the back office set up (backofficeUrl), it goes there
  // as data (`path`, `body`); otherwise to formEndpoint, otherwise the visitor's
  // email app opens with `fields` written out.
  function submit(o) {
    var lines = Object.keys(o.fields)
      .filter(function (k) { return o.fields[k]; })
      .map(function (k) { return k + ": " + o.fields[k]; });

    if (cfg.backofficeUrl) {
      return postJson(cfg.backofficeUrl.replace(/\/$/, "") + o.path, o.body, 3).then(function (data) {
        data.method = "backoffice";
        return data;
      });
    }
    if (cfg.formEndpoint) {
      return postJson(cfg.formEndpoint, Object.assign({ _subject: o.subject }, o.fields), 2).then(function () {
        return { method: "form" };
      });
    }
    window.location.href =
      "mailto:" + cfg.email +
      "?subject=" + encodeURIComponent(o.subject) +
      "&body=" + encodeURIComponent(lines.join("\n"));
    return Promise.resolve({ method: "email" });
  }

  // Older call style, kept for simple forms: send(subject, {Label: value}).
  function send(subject, fields) {
    return submit({ subject: subject, fields: fields, path: "/api/forms", body: { form: subject, fields: fields } });
  }

  // Shows a plain message above the form's Send button (or clears it).
  function showError(form, msg) {
    var box = form.querySelector(".form-alert");
    var btn = form.querySelector("button[type=submit]");
    if (!box) {
      box = document.createElement("p");
      box.className = "form-alert";
      box.setAttribute("role", "alert");
      btn.parentNode.insertBefore(box, btn);
    }
    box.hidden = !msg;
    box.innerHTML = msg
      ? msg + (/[.!?]$/.test(msg) ? "" : ".") + ' You can also call or text <a href="tel:' + cfg.phoneHref + '">' + cfg.phone + "</a>."
      : "";
  }

  // Honeypot: a field people never see. Bots that fill it are ignored by the back office.
  function honeypot(form) {
    if (form.querySelector('[name="company_website"]')) return;
    var trap = document.createElement("div");
    trap.className = "hp";
    trap.setAttribute("aria-hidden", "true");
    trap.innerHTML = '<label>Company website<input name="company_website" tabindex="-1" autocomplete="off" /></label>';
    form.appendChild(trap);
  }

  // "How should we reach you?": the chosen method's field becomes required and
  // the other stays optional.
  function contactPreference(form) {
    var radios = $$('input[name="preferred_contact"]', form);
    if (!radios.length) return;
    var update = function () {
      var pick = radios.filter(function (r) { return r.checked; })[0];
      var want = pick ? pick.value : "phone";
      ["phone", "email"].forEach(function (kind) {
        var input = $('[data-contact="' + kind + '"]', form);
        if (!input) return;
        var on = kind === want;
        input.required = on;
        var tag = $('label[for="' + input.id + '"] [data-req]', form);
        if (tag) tag.innerHTML = on ? "*" : '<span class="opt">(optional)</span>';
        if (!on) {
          var f = input.closest(".field");
          if (f && !input.value) f.classList.remove("has-error");
        }
      });
    };
    radios.forEach(function (r) { r.addEventListener("change", update); });
    update();
  }

  // Who the visitor is and how to reach them, in the back office's field names.
  function contactBody(form, data) {
    return {
      name: data.name || data.Name || data["Full name"] || data["Your name"] ||
        [data["First name"], data["Last name"]].filter(Boolean).join(" "),
      email: data.email || data.Email || data["Your email"] || "",
      phone: data.phone || data.Phone || "",
      preferred_contact: data.preferred_contact || "",
      marketing_opt_in: !!data.marketing_opt_in,
      request_id: requestId(form),
      company_website: data.company_website || ""
    };
  }

  // Checks required fields inside `root`; marks errors and focuses the first.
  function validate(root) {
    var ok = true;
    var first = null;
    var seenGroups = {};
    function mark(el, field, valid) {
      if (field) field.classList.toggle("has-error", !valid);
      if (!valid) {
        ok = false;
        if (!first) first = el;
      }
    }
    $$("[required]", root).forEach(function (el) {
      if (el.type === "radio") {
        if (seenGroups[el.name]) return;
        seenGroups[el.name] = true;
        var checked = $$('input[name="' + el.name + '"]', root).some(function (r) { return r.checked; });
        mark(el, el.closest(".field"), checked);
        return;
      }
      var valid = el.type === "checkbox" ? el.checked : el.value.trim() !== "";
      if (valid && el.type === "email") valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
      if (valid && el.type === "tel") valid = el.value.replace(/\D/g, "").length >= 10;
      el.setAttribute("aria-invalid", valid ? "false" : "true");
      mark(el, el.closest(".field") || el.closest(".consent"), valid);
    });
    // Optional email and phone fields are checked only when filled in.
    $$('input[type="email"]:not([required]), input[type="tel"]:not([required])', root).forEach(function (el) {
      var v = el.value.trim();
      if (!v) return;
      var valid = el.type === "email" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) : v.replace(/\D/g, "").length >= 10;
      el.setAttribute("aria-invalid", valid ? "false" : "true");
      mark(el, el.closest(".field"), valid);
    });
    $$("[data-group-required]", root).forEach(function (group) {
      var any = $$("input", group).some(function (i) { return i.checked; });
      mark($("input", group), group, any);
    });
    if (first) first.focus();
    return ok;
  }

  // Collects named fields into {name: value}; checkboxes with the same name are joined.
  function collect(form) {
    var out = {};
    $$("input, select, textarea", form).forEach(function (el) {
      if (!el.name || el.disabled) return;
      if ((el.type === "radio" || el.type === "checkbox") && !el.checked) return;
      if (el.name === "company_website") return;
      var v = el.value.trim();
      if (!v) return;
      out[el.name] = out[el.name] ? out[el.name] + ", " + v : v;
    });
    return out;
  }

  function clearErrorOnInput(form) {
    form.addEventListener("input", function (e) {
      var field = e.target.closest(".has-error");
      if (field) field.classList.remove("has-error");
      e.target.setAttribute("aria-invalid", "false");
    });
    form.addEventListener("change", function (e) {
      var field = e.target.closest(".has-error");
      if (field) field.classList.remove("has-error");
    });
  }

  function showSuccess(form) {
    $$(".form-body, .book-step, .stepper", form).forEach(function (el) {
      el.hidden = true;
      el.classList.remove("active");
    });
    var ok = $(".form-success", form);
    ok.classList.add("show");
    ok.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function zipServed(zip) {
    if (!/^\d{5}$/.test(zip)) return null;
    if ((cfg.extraZips || []).indexOf(zip) !== -1) return true;
    return cfg.zipPrefixes.indexOf(zip.slice(0, 3)) !== -1;
  }

  window.ShinePrice = { money: money, fillSelect: fillSelect, findById: findById, serviceList: serviceList, quoteRows: quoteRows };
  window.ShineForm = {
    send: send, submit: submit, validate: validate, collect: collect, clearErrorOnInput: clearErrorOnInput,
    showSuccess: showSuccess, showError: showError, zipServed: zipServed, requestId: requestId,
    honeypot: honeypot, contactPreference: contactPreference, contactBody: contactBody
  };

  $$("form[data-form], form[data-estimate], form[data-newsletter]").forEach(function (form) {
    honeypot(form);
    contactPreference(form);
  });

  /* ---------- Shared page chrome ---------- */

  $$("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  var header = $(".site-header");
  var mobileBar = $("[data-mobile-bar]");
  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle("scrolled", y > 8);
    if (mobileBar) mobileBar.classList.toggle("show", y > 360);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Services dropdown (desktop)
  $$(".nav-drop").forEach(function (drop) {
    var btn = $(".nav-drop-btn", drop);
    var set = function (open) {
      drop.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
    };
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      set(!drop.classList.contains("open"));
    });
    drop.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        set(false);
        btn.focus();
      }
    });
    drop.addEventListener("focusout", function (e) {
      if (!drop.contains(e.relatedTarget)) set(false);
    });
    document.addEventListener("click", function () {
      set(false);
    });
  });

  // Mobile menu
  var toggle = $(".menu-toggle");
  var menu = $("#mobile-menu");
  if (toggle && menu) {
    var setMenu = function (open) {
      menu.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      toggle.querySelector("use").setAttribute("href", open ? "#i-close" : "#i-menu");
      document.body.style.overflow = open ? "hidden" : "";
    };
    toggle.addEventListener("click", function () {
      setMenu(!menu.classList.contains("open"));
    });
    $$("a", menu).forEach(function (a) {
      a.addEventListener("click", function () {
        setMenu(false);
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("open")) setMenu(false);
    });
  }

  // On a service page, the header and bottom-bar estimate buttons keep that
  // service, so the estimate form opens with it already chosen.
  var serviceLink = $('main a[href*="free-estimate?service="]');
  if (serviceLink) {
    var svc = serviceLink.getAttribute("href").match(/service=([\w-]+)/)[1];
    $$('.site-header a[href$="free-estimate"], .mobile-menu a[href$="free-estimate"], [data-mobile-bar] a[href$="free-estimate"], .site-header a[href$="free-estimate/index.html"], .mobile-menu a[href$="free-estimate/index.html"], [data-mobile-bar] a[href$="free-estimate/index.html"]').forEach(function (a) {
      a.setAttribute("href", a.getAttribute("href") + "?service=" + svc);
    });
  }

  // "Chat With Us": opens the chat link if set, otherwise a text message.
  $$("[data-chat]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (cfg.chatUrl) window.open(cfg.chatUrl, "_blank", "noopener");
      else window.location.href = "sms:" + cfg.phoneHref;
    });
  });

  // Fade-in on scroll
  var reveals = $$(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    reveals.forEach(function (el) {
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) {
      el.classList.add("in");
    });
  }

  /* ---------- Home: instant price estimate ---------- */

  var quoteForm = $("#quote");
  if (quoteForm) {
    var qService = $("[data-quote-services]", quoteForm);
    var qSize = $("[data-quote-sizes]", quoteForm);
    fillSelect(qService, serviceList(function (s) { return !s.recurring && (!s.quoteOnly || s.id === "event"); }), "standard");
    fillSelect(qSize, PR.sizes, "2");
    var updateQuote = function () {
      var q = SP.quote({ service: qService.value, size: qSize.value });
      qSize.disabled = !!PR.services[qService.value].quoteOnly;
      $("[data-q-amount]", quoteForm).innerHTML = q.quoteOnly ? "Custom" : money(q.total) + (q.unit === "turn" ? "<small>/ turn</small>" : "<small>/ visit</small>");
      $("[data-q-label]", quoteForm).textContent = q.quoteOnly ? "We'll send a personalized quote" : "Estimated total";
      $("[data-q-break]", quoteForm).textContent = q.quoteOnly
        ? "Plus " + PR.travelFeeLabel + " — " + money(PR.travelFee) + " per visit"
        : "Cleaning " + money(q.subtotal) + " + " + PR.travelFeeLabel + " — " + money(q.travelFee);
    };
    quoteForm.addEventListener("change", updateQuote);
    updateQuote();
  }

  /* ---------- ZIP checker ---------- */

  $$("[data-zip-check]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = $("input", form);
      var out = $(".zip-result", form);
      var zip = input.value.trim();
      var served = zipServed(zip);
      if (served === null) {
        out.className = "zip-result bad";
        out.textContent = "Please enter a 5-digit ZIP code.";
      } else if (served) {
        out.className = "zip-result good";
        out.innerHTML = "Yes! We serve " + zip + '. <a href="' + linkTo("free-estimate") + "?zip=" + zip + '">Get a free estimate →</a>';
      } else {
        out.className = "zip-result bad";
        out.innerHTML = "That ZIP may be outside our usual area. Call <a href=\"tel:" + cfg.phoneHref + "\">" + cfg.phone + "</a> and we'll check.";
      }
    });
  });

  // Builds a link to a page that works both on the live site and in the file preview.
  function linkTo(page) {
    var a = $('a[href*="' + page + '"]');
    return a ? a.getAttribute("href").split("?")[0] : "/" + page;
  }

  /* ---------- Newsletter ---------- */

  $$("[data-newsletter]").forEach(function (form) {
    clearErrorOnInput(form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var out = $(".zip-result", form);
      var email = $("input[type=email]", form);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        out.className = "zip-result bad";
        out.textContent = "Please enter a valid email address.";
        email.focus();
        return;
      }
      if (!$("input[type=checkbox]", form).checked) {
        out.className = "zip-result bad";
        out.textContent = "Please tick the box to agree to receive emails.";
        return;
      }
      if (form._sending) return;
      form._sending = true;
      submit({
        subject: "Newsletter signup",
        fields: { Email: email.value.trim(), Consent: "Yes" },
        path: "/api/newsletter",
        body: {
          email: email.value.trim(), consent: true, request_id: requestId(form),
          company_website: ($('[name="company_website"]', form) || {}).value || ""
        }
      }).then(function () {
        out.className = "zip-result good";
        out.textContent = "Thanks! You're on the list.";
        form.reset();
        form._requestId = null;
      }, function (err) {
        out.className = "zip-result bad";
        out.textContent = err.message + " Please try again.";
      }).then(function () {
        form._sending = false;
      });
    });
  });

  /* ---------- Checklist tabs (mobile shows one column at a time) ---------- */

  $$("[data-checklist]").forEach(function (box) {
    var table = $("table", box);
    var buttons = $$("[role=tab]", box);
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        buttons.forEach(function (o) {
          o.setAttribute("aria-selected", String(o === b));
        });
        table.setAttribute("data-show", b.getAttribute("data-col"));
      });
    });
  });
})();

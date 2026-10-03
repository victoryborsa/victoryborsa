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

  function findById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }

  // Price for a service and home size; null when it needs a custom quote.
  function price(serviceId, sizeId) {
    var service = findById(cfg.services, serviceId);
    if (service.quoteOnly) return null;
    var i = Math.max(0, cfg.sizes.map(function (s) { return s.id; }).indexOf(sizeId));
    var p = service.prices[i];
    return p == null ? null : p;
  }

  function money(n) {
    return "$" + n.toLocaleString("en-US");
  }

  function fillSelect(sel, list, selected) {
    sel.innerHTML = list
      .map(function (o) {
        return '<option value="' + o.id + '"' + (o.id === selected ? " selected" : "") + ">" + o.label + "</option>";
      })
      .join("");
  }

  /* ---------- Sending requests ---------- */

  function send(subject, fields) {
    var lines = Object.keys(fields)
      .filter(function (k) {
        return fields[k];
      })
      .map(function (k) {
        return k + ": " + fields[k];
      });

    if (cfg.formEndpoint) {
      var payload = Object.assign({ _subject: subject }, fields);
      return fetch(cfg.formEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok) throw new Error("Request failed");
        return { method: "form" };
      });
    }

    window.location.href =
      "mailto:" + cfg.email +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(lines.join("\n"));
    return Promise.resolve({ method: "email" });
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

  window.ShinePrice = { price: price, money: money, fillSelect: fillSelect, findById: findById };
  window.ShineForm = { send: send, validate: validate, collect: collect, clearErrorOnInput: clearErrorOnInput, showSuccess: showSuccess, zipServed: zipServed };

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
    fillSelect(qService, cfg.services.filter(function (s) { return !s.hidden; }), "standard");
    fillSelect(qSize, cfg.sizes, "2");
    var updateQuote = function () {
      var service = findById(cfg.services, qService.value);
      var p = price(qService.value, qSize.value);
      qSize.disabled = !!service.quoteOnly;
      $("[data-q-amount]", quoteForm).innerHTML = p == null ? "Custom" : money(p) + (service.unit ? "<small>/ turn</small>" : "");
      $("[data-q-label]", quoteForm).textContent = p == null ? "We'll send a personalized quote" : "Estimated price";
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
      send("Newsletter signup", { Email: email.value.trim(), Consent: "Yes" }).then(function () {
        out.className = "zip-result good";
        out.textContent = "Thanks! You're on the list.";
        form.reset();
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

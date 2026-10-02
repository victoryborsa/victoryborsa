/* Shared behaviour for every page, plus the home page widgets. */
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

  function quote(serviceId, sizeId, freqId) {
    var service = findById(cfg.services, serviceId);
    var size = findById(cfg.sizes, sizeId);
    var freq = findById(cfg.frequencies, freqId || "once");
    if (service.quoteOnly) {
      return { service: service, size: size, freq: freq, quoteOnly: true };
    }
    var base = Math.max(service.from || 0, size.price + (service.add || 0));
    var total = Math.round(base * (1 - freq.discount));
    return { service: service, size: size, freq: freq, base: base, total: total, saved: base - total };
  }

  function money(n) {
    return "$" + n.toLocaleString("en-US");
  }

  function maxDiscount() {
    return cfg.frequencies.reduce(function (m, f) {
      return Math.max(m, f.discount);
    }, 0);
  }

  function fillSelect(sel, list, selected) {
    sel.innerHTML = list
      .map(function (o) {
        return '<option value="' + o.id + '"' + (o.id === selected ? " selected" : "") + ">" + o.label + "</option>";
      })
      .join("");
  }

  function fillFrequencies(wrap, name, selected) {
    wrap.innerHTML = cfg.frequencies
      .map(function (f) {
        var off = f.discount ? "<small>Save " + Math.round(f.discount * 100) + "%</small>" : "";
        return (
          '<label><input type="radio" name="' + name + '" value="' + f.id + '"' +
          (f.id === selected ? " checked" : "") + "><span>" + f.label + off + "</span></label>"
        );
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

    var href =
      "mailto:" + cfg.email +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(lines.join("\n"));
    window.location.href = href;
    return Promise.resolve({ method: "email" });
  }

  function validate(form) {
    var ok = true;
    var first = null;
    $$("[required]", form).forEach(function (el) {
      var valid = el.type === "checkbox" ? el.checked : el.value.trim() !== "";
      if (valid && el.type === "email") valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
      if (valid && el.type === "tel") valid = el.value.replace(/\D/g, "").length >= 10;
      var field = el.closest(".field");
      if (field) field.classList.toggle("has-error", !valid);
      el.setAttribute("aria-invalid", valid ? "false" : "true");
      if (!valid) {
        ok = false;
        if (!first) first = el;
      }
    });
    if (first) first.focus();
    return ok;
  }

  window.ShinePrice = {
    quote: quote,
    money: money,
    fillSelect: fillSelect,
    fillFrequencies: fillFrequencies,
    findById: findById
  };
  window.ShineForm = { send: send, validate: validate };

  /* ---------- Shared page chrome ---------- */

  $$("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
  $$("[data-email]").forEach(function (el) {
    el.href = "mailto:" + cfg.email;
    if (!el.children.length) el.textContent = cfg.email;
  });
  $$("[data-email-text]").forEach(function (el) {
    el.textContent = cfg.email;
  });

  var header = $(".site-header");
  var mobileBar = $("[data-mobile-bar]");
  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle("scrolled", y > 8);
    if (mobileBar) mobileBar.classList.toggle("show", y > 480);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

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

  /* ---------- Home: instant price ---------- */

  var quoteForm = $("#quote");
  if (quoteForm) {
    var qService = $("[data-services]", quoteForm);
    var qSize = $("[data-sizes]", quoteForm);
    var qFreq = $("[data-frequencies]", quoteForm);
    fillSelect(qService, cfg.services, "standard");
    fillSelect(qSize, cfg.sizes, "2");
    fillFrequencies(qFreq, "frequency", "once");

    var updateQuote = function () {
      var freqInput = $("input[name=frequency]:checked", quoteForm);
      var q = quote(qService.value, qSize.value, freqInput ? freqInput.value : "once");
      var amount = $("[data-q-amount]", quoteForm);
      var label = $("[data-q-label]", quoteForm);
      if (q.quoteOnly) {
        amount.textContent = "Custom";
        label.textContent = "We'll send a quote the same day";
        $("[data-q-was]", quoteForm).textContent = "";
        $("[data-q-save]", quoteForm).textContent = "";
        qSize.disabled = true;
        return;
      }
      qSize.disabled = false;
      amount.innerHTML = money(q.total) + "<small>/ visit</small>";
      label.textContent = q.freq.id === "once" ? "Estimated price" : "Estimated price, " + q.freq.label.toLowerCase();
      $("[data-q-was]", quoteForm).textContent = q.saved ? money(q.base) : "";
      $("[data-q-save]", quoteForm).textContent = q.saved ? "You save " + money(q.saved) : "";
    };
    quoteForm.addEventListener("change", updateQuote);
    updateQuote();
  }

  /* ---------- Home: pricing table ---------- */

  var tabs = $("[data-price-tabs]");
  var rows = $("[data-price-rows]");
  if (tabs && rows) {
    var priced = cfg.services.filter(function (s) {
      return !s.quoteOnly && ["standard", "deep", "move"].indexOf(s.id) !== -1;
    });
    var shortNames = { standard: "Standard", deep: "Deep", move: "Move in/out" };
    tabs.innerHTML = priced
      .map(function (s, i) {
        return (
          '<button type="button" role="tab" id="tab-' + s.id + '" aria-selected="' + (i === 0) +
          '" aria-controls="price-panel" data-id="' + s.id + '">' + (shortNames[s.id] || s.label) + "</button>"
        );
      })
      .join("");
    rows.id = "price-panel";
    rows.setAttribute("role", "tabpanel");

    var showTab = function (id) {
      $$("button", tabs).forEach(function (b) {
        var on = b.getAttribute("data-id") === id;
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
      });
      rows.setAttribute("aria-labelledby", "tab-" + id);
      rows.innerHTML = cfg.sizes
        .map(function (size) {
          var q = quote(id, size.id, "once");
          return "<li><span>" + size.label + '</span><span class="amt">' + money(q.total) + "</span></li>";
        })
        .join("");
    };
    tabs.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b) showTab(b.getAttribute("data-id"));
    });
    tabs.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var buttons = $$("button", tabs);
      var i = buttons.indexOf(document.activeElement);
      var next = buttons[(i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length];
      next.focus();
      showTab(next.getAttribute("data-id"));
    });
    showTab(priced[0].id);

    var top = maxDiscount();
    var note = $("[data-discount-note]");
    var answer = $("[data-discount-answer]");
    var parts = cfg.frequencies
      .filter(function (f) {
        return f.discount;
      })
      .map(function (f) {
        return Math.round(f.discount * 100) + "% off " + f.label.toLowerCase();
      });
    if (top) {
      if (note) note.textContent = "Recurring visits save up to " + Math.round(top * 100) + "%: " + parts.join(", ") + ".";
      if (answer) answer.textContent = "Yes. Recurring visits are discounted automatically: " + parts.join(", ") + ". You can pause or change your schedule any time.";
    } else if (note) {
      note.parentNode.hidden = true;
    }
  }

  /* ---------- Home: service area checker ---------- */

  var areaRoot = $("#areas [data-autocomplete]");
  if (areaRoot && window.ShineAddress) {
    var result = $("[data-area-result]");
    ShineAddress.attach(areaRoot, {
      onInput: function () {
        result.className = "area-result";
      },
      onSelect: function (place) {
        var d = ShineAddress.describeArea(place);
        result.className = "area-result show " + (d.ok ? "ok" : "far");
        result.innerHTML =
          '<svg class="icon icon-sm" aria-hidden="true"><use href="#' + (d.ok ? "i-check-circle" : "i-pin") + '" /></svg><span>' +
          d.text + (d.ok ? ' <a href="book.html?address=' + encodeURIComponent(place.label) + '">Book now</a>' : "") +
          "</span>";
      }
    });
  }

  /* ---------- Home: contact form ---------- */

  var contact = $("#contact-form");
  if (contact) {
    contact.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!validate(contact)) return;
      var btn = $("button[type=submit]", contact);
      btn.disabled = true;
      send("Website message from " + contact.name.value.trim(), {
        Name: contact.name.value.trim(),
        Phone: contact.phone.value.trim(),
        Email: contact.email.value.trim(),
        Message: contact.message.value.trim()
      })
        .then(function () {
          $(".form-body", contact).hidden = true;
          $(".form-success", contact).classList.add("show");
        })
        .catch(function () {
          btn.disabled = false;
          alert("Sorry, something went wrong. Please call us at " + cfg.phone + ".");
        });
    });
    contact.addEventListener("input", function (e) {
      var field = e.target.closest(".field");
      if (field && field.classList.contains("has-error")) {
        field.classList.remove("has-error");
        e.target.setAttribute("aria-invalid", "false");
      }
    });
  }
})();

/* Booking page: five-step request form with live price summary. */
(function () {
  var cfg = window.SHINE;
  var P = window.ShinePrice;
  var form = document.getElementById("book-form");
  if (!form) return;

  var $ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  var params = new URLSearchParams(window.location.search);
  var serviceIcons = {
    standard: "i-home",
    deep: "i-deep",
    move: "i-box",
    airbnb: "i-key",
    apartment: "i-building",
    event: "i-confetti"
  };
  var state = {
    step: 1,
    place: null
  };

  /* ---------- Build choices ---------- */

  var initialService = params.get("service") || "standard";
  var initialSize = params.get("size") || "2";
  var initialFreq = params.get("frequency") || "once";

  $("[data-service-choices]").innerHTML = cfg.services
    .map(function (s) {
      var price = s.quoteOnly ? "Custom quote" : "from $" + s.from;
      return (
        '<label class="choice"><input type="radio" name="service" value="' + s.id + '"' +
        (s.id === initialService ? " checked" : "") + '><span class="box">' +
        '<svg class="icon" aria-hidden="true"><use href="#' + (serviceIcons[s.id] || "i-sparkle") + '" /></svg>' +
        "<strong>" + s.label + "</strong><small>" + price + "</small></span></label>"
      );
    })
    .join("");

  $("[data-size-choices]").innerHTML = cfg.sizes
    .map(function (s) {
      return (
        '<label class="choice compact"><input type="radio" name="size" value="' + s.id + '"' +
        (s.id === initialSize ? " checked" : "") + '><span class="box"><strong>' + s.label + "</strong></span></label>"
      );
    })
    .join("");

  P.fillFrequencies($("[data-freq-choices]"), "frequency", initialFreq);

  $("[data-window-choices]").innerHTML = cfg.arrivalWindows
    .map(function (w, i) {
      return (
        '<label class="choice compact"><input type="radio" name="window" value="' + w + '"' +
        (i === 0 ? " checked" : "") + '><span class="box"><strong>' + w + "</strong></span></label>"
      );
    })
    .join("");

  // Earliest date is tomorrow; skip Sunday.
  var dateInput = $("#b-date");
  function iso(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  var earliest = new Date();
  earliest.setDate(earliest.getDate() + 1);
  if (earliest.getDay() === 0) earliest.setDate(earliest.getDate() + 1);
  dateInput.min = iso(earliest);
  var latest = new Date();
  latest.setDate(latest.getDate() + 90);
  dateInput.max = iso(latest);

  function parseDate(v) {
    if (!v) return null;
    var parts = v.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  function niceDate(v) {
    var d = parseDate(v);
    return d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
  }

  if (params.get("address")) {
    $("#b-address").value = params.get("address");
  }

  /* ---------- Summary ---------- */

  function val(name) {
    var el = form.elements[name];
    if (!el) return "";
    if (el.length !== undefined && !el.tagName) {
      for (var i = 0; i < el.length; i++) if (el[i].checked) return el[i].value;
      return "";
    }
    return el.value;
  }

  function currentQuote() {
    return P.quote(val("service"), val("size"), val("frequency"));
  }

  function updateSummary() {
    var q = currentQuote();
    var quoteOnly = !!q.quoteOnly;
    $("[data-size-field]").hidden = quoteOnly;
    $("[data-freq-field]").hidden = quoteOnly || q.service.id === "move" || q.service.id === "airbnb";

    var amount = quoteOnly ? "Custom" : P.money(q.total);
    $("[data-sum-service]").textContent = q.service.label;
    $("[data-sum-size]").textContent = quoteOnly ? "—" : q.size.label;
    $("[data-sum-freq]").textContent = quoteOnly ? "—" : q.freq.label;
    var when = dateInput.value ? niceDate(dateInput.value) + ", " + val("window") : "Choose a date";
    $("[data-sum-when]").textContent = when;
    $("[data-sum-amount]").textContent = amount;
    $("[data-sum-label]").textContent = quoteOnly ? "We'll quote the same day" : "Estimated per visit";
    $("[data-sum-save]").textContent = !quoteOnly && q.saved ? "Saving " + P.money(q.saved) : "";
    $("[data-sum-total]").textContent = amount;
    $("[data-sum-short]").textContent = q.service.label + (quoteOnly ? "" : " · " + q.size.label);
  }

  // Move-out and turnover are usually one-off, so reset frequency when hidden.
  form.addEventListener("change", function (e) {
    if (e.target.name === "service" && (e.target.value === "move" || e.target.value === "airbnb" || e.target.value === "event")) {
      var once = form.querySelector('input[name=frequency][value="once"]');
      if (once) once.checked = true;
    }
    updateSummary();
  });

  /* ---------- Address ---------- */

  var areaResult = $("[data-area-result]", form);
  ShineAddress.attach($("[data-autocomplete]", form), {
    onInput: function () {
      state.place = null;
      areaResult.className = "area-result";
    },
    onSelect: function (place) {
      state.place = place;
      if (place.zip) $("#b-zip").value = place.zip.slice(0, 5);
      var d = ShineAddress.describeArea(place);
      areaResult.className = "area-result show " + (d.ok ? "ok" : "far");
      areaResult.innerHTML =
        '<svg class="icon icon-sm" aria-hidden="true"><use href="#' + (d.ok ? "i-check-circle" : "i-pin") + '" /></svg><span>' + d.text + "</span>";
      var field = $("#b-address").closest(".field");
      field.classList.remove("has-error");
      $("#b-unit").focus();
    }
  });

  /* ---------- Validation ---------- */

  function setError(input, bad) {
    var field = input.closest(".field");
    if (field) field.classList.toggle("has-error", bad);
    input.setAttribute("aria-invalid", bad ? "true" : "false");
    return bad;
  }

  function validateStep(n) {
    var section = $('[data-step="' + n + '"]', form);
    var firstBad = null;
    $$("[required]", section).forEach(function (input) {
      var v = input.value.trim();
      var bad = v === "";
      if (!bad && input.type === "email") bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      if (!bad && input.type === "tel") bad = v.replace(/\D/g, "").length < 10;
      if (!bad && input.name === "zip") bad = !/^\d{5}$/.test(v);
      if (!bad && input.name === "date") {
        var d = parseDate(v);
        bad = !d || d.getDay() === 0 || v < dateInput.min || v > dateInput.max;
      }
      if (setError(input, bad) && !firstBad) firstBad = input;
    });
    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  form.addEventListener("input", function (e) {
    var field = e.target.closest(".field");
    if (field && field.classList.contains("has-error")) setError(e.target, false);
  });

  // Format phone as (412) 555-0123 while typing.
  $("#b-phone").addEventListener("input", function (e) {
    var d = e.target.value.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
    var out = d;
    if (d.length > 6) out = "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
    else if (d.length > 3) out = "(" + d.slice(0, 3) + ") " + d.slice(3);
    e.target.value = out;
  });

  /* ---------- Steps ---------- */

  var steps = $$(".stepper li");

  function goTo(n) {
    state.step = n;
    $$(".book-step", form).forEach(function (s) {
      s.classList.toggle("active", Number(s.getAttribute("data-step")) === n);
    });
    steps.forEach(function (li, i) {
      li.classList.toggle("done", i + 1 < n);
      li.classList.toggle("current", i + 1 === n);
      if (i + 1 === n) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
    if (n === 5) renderReview();
    var heading = $('[data-step="' + n + '"] h2', form);
    var top = $(".stepper").getBoundingClientRect().top + window.scrollY - 96;
    if (window.scrollY > top) window.scrollTo({ top: top, behavior: "smooth" });
    if (heading) heading.focus({ preventScroll: true });
  }

  form.addEventListener("click", function (e) {
    if (e.target.closest("[data-next]")) {
      if (validateStep(state.step)) goTo(state.step + 1);
    } else if (e.target.closest("[data-back]")) {
      goTo(state.step - 1);
    } else if (e.target.closest("[data-edit]")) {
      goTo(Number(e.target.closest("[data-edit]").getAttribute("data-edit")));
    }
  });

  // Enter in a text field moves forward instead of submitting early.
  form.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.getAttribute("role") !== "combobox" && state.step < 5) {
      e.preventDefault();
      if (validateStep(state.step)) goTo(state.step + 1);
    }
  });

  function fullAddress() {
    var a = $("#b-address").value.trim();
    var unit = $("#b-unit").value.trim();
    var zip = $("#b-zip").value.trim();
    var s = a + (unit ? ", " + unit : "");
    if (zip && a.indexOf(zip) === -1) s += " " + zip;
    return s;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function details() {
    var q = currentQuote();
    return {
      Service: q.service.label,
      "Home size": q.quoteOnly ? "" : q.size.label,
      Frequency: q.quoteOnly ? "" : q.freq.label,
      "Estimated price": q.quoteOnly ? "Custom quote" : P.money(q.total) + " per visit",
      Date: niceDate(dateInput.value),
      "Arrival window": val("window"),
      Address: fullAddress(),
      "In service area": state.place ? (state.place.inArea ? "Yes" : "No, about " + Math.round(state.place.miles) + " miles out") : "Not checked",
      "Entry instructions": $("#b-access").value.trim(),
      Name: $("#b-first").value.trim() + " " + $("#b-last").value.trim(),
      Phone: $("#b-phone").value.trim(),
      Email: $("#b-email").value.trim(),
      Notes: $("#b-notes").value.trim(),
      "Text reminders": form.elements.sms.checked ? "Yes" : "No"
    };
  }

  function renderReview() {
    var d = details();
    var rows = [
      ["Service", d.Service + (d["Home size"] ? ", " + d["Home size"] : ""), 1],
      ["Frequency", d.Frequency || "One time", 1],
      ["Price", d["Estimated price"], 1],
      ["When", d.Date + ", " + d["Arrival window"], 2],
      ["Address", d.Address, 3],
      ["Contact", d.Name + " · " + d.Phone + " · " + d.Email, 4]
    ];
    if (d.Notes) rows.push(["Notes", d.Notes, 4]);
    $("[data-review]").innerHTML = rows
      .map(function (r) {
        return (
          "<div><dt>" + r[0] + "</dt><dd>" + escapeHtml(r[1]) + '</dd><button type="button" data-edit="' + r[2] +
          '" aria-label="Edit ' + r[0].toLowerCase() + '">Edit</button></div>'
        );
      })
      .join("");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (state.step !== 5) return;
    var btn = $("[data-submit]");
    btn.disabled = true;
    btn.textContent = "Sending…";
    var d = details();
    ShineForm.send("Booking request: " + d.Service + " on " + d.Date + " (" + d.Name + ")", d)
      .then(function (res) {
        $$(".book-step", form).forEach(function (s) {
          s.classList.remove("active");
        });
        steps.forEach(function (li) {
          li.classList.add("done");
          li.classList.remove("current");
        });
        $("[data-done-name]").textContent = $("#b-first").value.trim() || "friend";
        if (res.method === "email") {
          $("[data-done-text]").textContent =
            "Your email app should now open with your booking filled in. Just press send and we'll confirm the same day. If nothing opened, call or text us at " + cfg.phone + ".";
        }
        var done = $("[data-done]");
        done.classList.add("show");
        window.scrollTo({ top: $(".stepper").getBoundingClientRect().top + window.scrollY - 96, behavior: "smooth" });
        $("h2", done).focus({ preventScroll: true });
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = "Request booking";
        alert("Sorry, we couldn't send your request. Please call or text us at " + cfg.phone + ".");
      });
  });

  updateSummary();
})();

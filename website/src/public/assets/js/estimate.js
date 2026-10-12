/* Free estimate: four short steps, then sends the request. */
(function () {
  var form = document.querySelector("[data-estimate]");
  if (!form) return;
  var cfg = window.SHINE;
  var P = window.ShinePrice;
  var F = window.ShineForm;
  var $ = function (sel) {
    return form.querySelector(sel);
  };
  var steps = Array.prototype.slice.call(form.querySelectorAll(".book-step"));
  var marks = Array.prototype.slice.call(form.querySelectorAll(".stepper li"));
  var current = 0;
  var params = new URLSearchParams(window.location.search);

  F.clearErrorOnInput(form);

  // Step 2 options
  P.fillSelect($("[data-sizes]"), cfg.sizes, "2");
  $("[data-frequencies]").innerHTML = cfg.frequencies
    .map(function (f, i) {
      return (
        '<label><input type="radio" name="frequency" value="' + f.id + '"' + (i === 1 ? " checked" : "") +
        "><span>" + f.label + "<small>Save " + Math.round(f.discount * 100) + "%</small></span></label>"
      );
    })
    .join("");
  $("[data-frequencies]").style.gridTemplateColumns = "repeat(" + cfg.frequencies.length + ", 1fr)";
  $("[data-addons]").innerHTML = cfg.addons
    .map(function (a) {
      return '<label><input type="checkbox" name="addons" value="' + a.label + " (" + a.price + ')"><span>' + a.label + " <small>" + a.price + "</small></span></label>";
    })
    .join("");

  // Prefill from links like /free-estimate?service=deep&city=Shadyside
  var service = params.get("service");
  if (service) {
    var radio = form.querySelector('input[name="service"][value="' + service + '"]');
    if (radio) radio.checked = true;
  }
  var place = params.get("city") || params.get("address");
  if (place) $("#e-address").value = place;
  if (params.get("zip")) $("#e-zip").value = params.get("zip");
  var today = new Date();
  $("#e-date").min = today.toISOString().slice(0, 10);

  function serviceId() {
    var r = form.querySelector('input[name="service"]:checked');
    return r ? r.value : null;
  }

  function updatePrice() {
    var id = serviceId() || "standard";
    var s = P.findById(cfg.services, id);
    var freqField = $("[data-frequency-field]");
    freqField.hidden = !s.recurring;
    var p = P.price(id, $("[data-sizes]").value);
    var out = $("[data-e-price]");
    var note = $("[data-e-note]");
    if (p == null) {
      out.textContent = "Custom quote";
      note.textContent = "We'll send a personalized price for larger homes.";
      return;
    }
    if (s.recurring) {
      var f = form.querySelector('input[name="frequency"]:checked');
      var d = P.findById(cfg.frequencies, f ? f.value : "biweekly").discount;
      out.innerHTML = P.money(Math.round(p * (1 - d))) + "<small> / visit</small>";
      note.textContent = "Includes your " + Math.round(d * 100) + "% recurring discount. Final price confirmed after we review your request.";
    } else {
      out.innerHTML = P.money(p) + (s.unit ? "<small> / turn</small>" : "");
      note.textContent = "Starting price before add-ons. Final price confirmed after we review your request.";
    }
  }
  form.addEventListener("change", updatePrice);

  function show(i) {
    steps.forEach(function (s, n) {
      s.classList.toggle("active", n === i);
    });
    marks.forEach(function (m, n) {
      m.classList.toggle("done", n < i);
      m.classList.toggle("current", n === i);
    });
    current = i;
    updatePrice();
    var top = form.getBoundingClientRect().top + window.scrollY - 90;
    if (window.scrollY > top) window.scrollTo({ top: top, behavior: "smooth" });
  }

  function stepOk(i) {
    if (i === 0) {
      var ok = !!serviceId();
      steps[0].querySelector(".step-error").textContent = ok ? "" : "Please choose a service to continue.";
      return ok;
    }
    return F.validate(steps[i]);
  }

  form.addEventListener("click", function (e) {
    if (e.target.closest("[data-next]") && stepOk(current)) show(current + 1);
    if (e.target.closest("[data-back]")) show(current - 1);
  });
  // Clear the "choose a service" message once one is picked.
  form.addEventListener("change", function (e) {
    if (e.target.name === "service" && current === 0) {
      steps[0].querySelector(".step-error").textContent = "";
    }
  });

  if (window.ShineAddress) {
    ShineAddress.attach(form.querySelector("[data-autocomplete]"), {
      onSelect: function (p) {
        if (p.zip) $("#e-zip").value = p.zip;
      }
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (current < steps.length - 1) {
      if (stepOk(current)) show(current + 1);
      return;
    }
    if (!F.validate(steps[current])) return;
    var data = F.collect(form);
    var s = P.findById(cfg.services, data.service);
    var size = P.findById(cfg.sizes, data.bedrooms);
    var fields = {
      Name: data.name,
      Phone: data.phone,
      Email: data.email,
      Service: s.label,
      Bedrooms: size.label,
      Bathrooms: data.bathrooms,
      Frequency: s.recurring ? P.findById(cfg.frequencies, data.frequency).label : "",
      "Add-ons": data.addons,
      "Estimated price": $("[data-e-price]").textContent,
      Address: data.address,
      ZIP: data.zip,
      "Preferred date": data.date,
      "Preferred time": data.time,
      "Referred by": data.referred,
      "Gift card code": data.gift,
      Notes: data.notes
    };
    var btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    F.send("Free estimate request from " + data.name, fields)
      .then(function () {
        F.showSuccess(form);
      })
      .catch(function () {
        btn.disabled = false;
        alert("Sorry, something went wrong. Please call us at " + cfg.phone + ".");
      });
  });

  // Coming from a service page: start on step 2.
  if (service && serviceId()) show(1);
  else updatePrice();
})();

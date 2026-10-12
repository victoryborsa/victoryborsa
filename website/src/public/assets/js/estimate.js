/* Free estimate: four short steps, an itemized estimate, then sends the request.
   Prices come from pricing.js (window.ShinePricing); the back office checks the
   same calculation again when the request arrives. */
(function () {
  var form = document.querySelector("[data-estimate]");
  if (!form) return;
  var cfg = window.SHINE;
  var SP = window.ShinePricing;
  var PR = SP.PRICING;
  var P = window.ShinePrice;
  var F = window.ShineForm;
  var $ = function (sel) {
    return form.querySelector(sel);
  };
  var $$ = function (sel) {
    return Array.prototype.slice.call(form.querySelectorAll(sel));
  };
  var steps = $$(".book-step");
  var marks = $$(".stepper li");
  var current = 0;
  var params = new URLSearchParams(window.location.search);

  F.clearErrorOnInput(form);

  // Step 2 options, all from the shared price list.
  P.fillSelect($("[data-sizes]"), PR.sizes, "2");
  var freqIds = Object.keys(PR.frequency).filter(function (id) { return PR.frequency[id].discount > 0; });
  $("[data-frequencies]").innerHTML = freqIds
    .map(function (id) {
      var f = PR.frequency[id];
      return (
        '<label><input type="radio" name="frequency" value="' + id + '"' + (id === "biweekly" ? " checked" : "") +
        "><span>" + f.label + "<small>Save " + Math.round(f.discount * 100) + "%</small></span></label>"
      );
    })
    .join("");
  $("[data-frequencies]").style.gridTemplateColumns = "repeat(" + freqIds.length + ", 1fr)";
  $("[data-addons]").innerHTML = PR.addons
    .map(function (a) {
      return (
        '<label data-addon="' + a.id + '"><input type="checkbox" name="addons" value="' + a.id + '"><span>' + a.label +
        ' <small data-addon-price>+' + P.money(a.price) + (a.perHour ? "/hr" : "") + "</small></span></label>"
      );
    })
    .join("");

  // Prefill from links like /free-estimate?service=deep&size=3&city=Shadyside
  var service = params.get("service");
  if (service) {
    var radio = form.querySelector('input[name="service"][value="' + service + '"]');
    if (radio) radio.checked = true;
  }
  var size = params.get("size") || params.get("bedrooms");
  if (size && form.querySelector('[data-sizes] option[value="' + size + '"]')) $("[data-sizes]").value = size;
  var freq = params.get("frequency");
  if (freq && form.querySelector('input[name="frequency"][value="' + freq + '"]')) form.querySelector('input[name="frequency"][value="' + freq + '"]').checked = true;
  var place = params.get("city") || params.get("address");
  if (place) $("#e-address").value = place;
  if (params.get("zip")) $("#e-zip").value = params.get("zip");
  $("#e-date").min = new Date().toISOString().slice(0, 10);

  function serviceId() {
    var r = form.querySelector('input[name="service"]:checked');
    return r ? r.value : null;
  }

  function picked() {
    return $$('input[name="addons"]:checked').map(function (i) { return i.value; });
  }

  function currentQuote() {
    var f = form.querySelector('input[name="frequency"]:checked');
    return SP.quote({
      service: serviceId() || "standard",
      size: $("[data-sizes]").value,
      frequency: f ? f.value : null,
      addons: picked(),
      organizingHours: $("#e-hours").value
    });
  }

  function updatePrice() {
    var id = serviceId() || "standard";
    var s = PR.services[id];
    var freqField = $("[data-frequency-field]");
    freqField.hidden = !s.recurring;
    $$('input[name="frequency"]').forEach(function (r) { r.disabled = !s.recurring; });
    $("[data-hours-field]").hidden = picked().indexOf("organizing") === -1;

    // Items the chosen service already includes show "Included" and cost nothing.
    $$("[data-addon]").forEach(function (label) {
      var a = PR.addons.filter(function (x) { return x.id === label.getAttribute("data-addon"); })[0];
      var included = (s.included || []).indexOf(a.id) !== -1;
      label.classList.toggle("is-included", included);
      label.querySelector("[data-addon-price]").textContent = included ? "Included" : "+" + P.money(a.price) + (a.perHour ? "/hr" : "");
    });

    var q = currentQuote();
    var rows = P.quoteRows(q);
    $("[data-e-lines]").innerHTML = rows;
    $("[data-e-summary]").innerHTML = rows;
    var note = $("[data-e-note]");
    if (q.quoteOnly) note.textContent = "We'll send a personalized price for this home. The " + P.money(PR.travelFee) + " travel fee applies per visit.";
    else if (s.recurring) note.textContent = "Price per visit. The recurring discount applies to the cleaning only, not add-ons or the travel fee. Each visit includes the travel fee once.";
    else note.textContent = "Final price confirmed after we review your request.";
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
    if (i === 1 && PR.services[serviceId()].recurring && !form.querySelector('input[name="frequency"]:checked')) {
      $("[data-frequency-field]").classList.add("has-error");
      return false;
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
    if (!F.validate(steps[current]) || form._sending) return;
    F.showError(form, "");
    var data = F.collect(form);
    var q = currentQuote();
    var s = PR.services[data.service];
    var sizeLabel = P.findById(PR.sizes, data.bedrooms).label;
    var estimate = q.lines
      .map(function (l) {
        return (l.kind === "travel" ? PR.travelFeeLabel : l.label) + ": " +
          (l.kind === "included" ? "Included" : (l.amount < 0 ? "-" : "") + P.money(Math.abs(l.amount)));
      })
      .concat(["Estimated total: " + (q.quoteOnly ? "Custom quote" : P.money(q.total))])
      .join("\n");
    var fields = {
      Name: data.name,
      "Preferred contact": data.preferred_contact === "email" ? "Email" : "Phone or text",
      Phone: data.phone,
      Email: data.email,
      Service: s.label,
      Bedrooms: sizeLabel,
      Bathrooms: data.bathrooms,
      Pets: data.pets || "None",
      Frequency: s.recurring ? PR.frequency[data.frequency].label : "",
      Estimate: "\n" + estimate,
      Address: data.address,
      ZIP: data.zip,
      "Preferred date": data.date,
      "Preferred time": data.time,
      "Referred by": data.referred,
      "Gift card code": data.gift,
      Notes: data.notes,
      "Offers and tips": data.marketing_opt_in ? "Yes" : "No"
    };
    var body = Object.assign(F.contactBody(form, data), {
      address: data.address,
      zip: data.zip,
      service_type: data.service,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      frequency: s.recurring ? data.frequency : "once",
      addons: picked(),
      organizing_hours: picked().indexOf("organizing") !== -1 ? Number(data.organizing_hours) : null,
      preferred_date: data.date,
      preferred_time: data.time,
      referred_by: data.referred,
      gift_code: data.gift,
      message: [data.pets ? "Pets: " + data.pets : "", data.notes].filter(Boolean).join("\n"),
      estimated_total: q.total
    });
    var btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    form._sending = true;
    btn.textContent = "Sending…";
    F.submit({ subject: "Free estimate request from " + data.name, fields: fields, path: "/api/leads", body: body })
      .then(function (res) {
        // The back office recalculates the price; show its numbers if they came back.
        var final = res && res.quote && res.quote.lines ? res.quote : q;
        var extra = form.querySelector("[data-success-extra]");
        if (extra) {
          extra.innerHTML =
            '<ul class="q-lines">' + P.quoteRows(final) + "</ul>" +
            "<p>This is your estimate request, not a confirmed appointment. We'll contact you by " +
            (data.preferred_contact === "email" ? "email" : "phone or text") +
            " to agree on a date and time; your appointment is confirmed once you get our confirmation.</p>";
        }
        F.showSuccess(form);
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = "Request My Free Estimate";
        F.showError(form, err.message);
      })
      .then(function () {
        form._sending = false;
      });
  });

  // Coming from a service page: start on step 2.
  if (service && serviceId()) show(1);
  else updatePrice();
})();

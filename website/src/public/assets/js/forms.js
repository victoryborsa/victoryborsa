/* Contact, careers, event quote and gift card forms: any <form data-form="Subject">. */
(function () {
  var F = window.ShineForm;
  var cfg = window.SHINE;

  Array.prototype.forEach.call(document.querySelectorAll("form[data-form]"), function (form) {
    F.clearErrorOnInput(form);

    // Gift cards: keep the button label in step with the chosen amount.
    if (form.hasAttribute("data-gift")) {
      var btn = form.querySelector("[data-gift-button]");
      form.addEventListener("change", function () {
        var amt = form.querySelector('input[name="Amount"]:checked');
        if (amt) btn.textContent = "Purchase " + amt.value + " Gift Card";
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!F.validate(form) || form._sending) return;
      F.showError(form, "");
      var submit = form.querySelector("button[type=submit]");
      var fields = F.collect(form);
      var who = fields["Name"] || fields["Full name"] || fields["Your name"] || fields["First name"] || "";
      var subject = form.getAttribute("data-form") + (who ? " from " + who : "");
      var contact = F.contactBody(form, fields);
      // Everything except who/how-to-reach goes along as label: value pairs.
      var rest = {};
      Object.keys(fields).forEach(function (k) {
        if (["preferred_contact", "marketing_opt_in", "consent"].indexOf(k) === -1) rest[k] = fields[k];
      });
      if (fields.preferred_contact) rest["Preferred contact"] = fields.preferred_contact === "email" ? "Email" : "Phone or text";
      var api = form.getAttribute("data-api");
      var request =
        api === "contact"
          ? { path: "/api/contact", body: Object.assign(contact, { message: fields["Message"] || "", interest: fields["Interested in"] || "" }) }
          : api === "lead"
            // Short quote forms (local area pages) become estimate requests like the main form.
            ? { path: "/api/leads", body: Object.assign(contact, {
                service_type: (fields["Frequency"] || "once") !== "once" && ["standard", "apartment"].indexOf(fields["Service"]) !== -1 ? "recurring" : fields["Service"], bedrooms: fields["Bedrooms"], frequency: fields["Frequency"] || "once",
                address: fields["Area"] || "", message: fields["Notes"] || ""
              }) }
            : { path: "/api/forms", body: Object.assign(contact, { form: form.getAttribute("data-form"), fields: rest }) };
      var sendIt = function () {
        return F.submit({ subject: subject, fields: rest, path: request.path, body: request.body });
      };

      // Gift cards with a Stripe Payment Link: send the order details, then go to Stripe to pay.
      var payLink = form.hasAttribute("data-gift") && (cfg.giftCardLinks || {})[fields["Amount"]];
      if (payLink) {
        var go = function () {
          window.location.href = payLink + (payLink.indexOf("?") === -1 ? "?" : "&") + "prefilled_email=" + encodeURIComponent(fields["Your email"]);
        };
        if (cfg.backofficeUrl || cfg.formEndpoint) sendIt().then(go, go);
        else go();
        return;
      }
      submit.disabled = true;
      form._sending = true;
      sendIt()
        .then(function () {
          F.showSuccess(form);
        })
        .catch(function (err) {
          submit.disabled = false;
          F.showError(form, err.message);
        })
        .then(function () {
          form._sending = false;
        });
    });
  });
})();

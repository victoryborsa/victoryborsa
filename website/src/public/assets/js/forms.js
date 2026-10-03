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
      if (!F.validate(form)) return;
      var submit = form.querySelector("button[type=submit]");
      submit.disabled = true;
      var fields = F.collect(form);
      var who = fields["Name"] || fields["Full name"] || fields["Your name"] || fields["First name"] || "";
      // Gift cards with a Stripe Payment Link: send the order details, then go to Stripe to pay.
      var payLink = form.hasAttribute("data-gift") && (cfg.giftCardLinks || {})[fields["Amount"]];
      if (payLink) {
        var go = function () {
          window.location.href = payLink + (payLink.indexOf("?") === -1 ? "?" : "&") + "prefilled_email=" + encodeURIComponent(fields["Your email"]);
        };
        if (cfg.formEndpoint) F.send("Gift card order from " + who, fields).then(go, go);
        else go();
        return;
      }
      F.send(form.getAttribute("data-form") + (who ? " from " + who : ""), fields)
        .then(function () {
          F.showSuccess(form);
        })
        .catch(function () {
          submit.disabled = false;
          alert("Sorry, something went wrong. Please call us at " + cfg.phone + ".");
        });
    });
  });
})();

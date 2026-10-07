import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentLater, paymentText } from "../../lib/statuses.ts";
import { methodLabel, paysAtProperty } from "../../lib/payment-rules.ts";

const manual = { status: "confirmed", payment_method: "cash" as const, payment_status: "none", total_cents: 85000, paid_cents: 0, due_now_cents: 0 };

test("a manual reservation with nothing paid shows the balance due at the property", () => {
  assert.equal(paymentText(manual), "Unpaid · $850 due at the property");
  assert.equal(paymentLater(manual), "Payment due at property.");
  assert.equal(methodLabel(manual), "Pay at the property");
  assert.equal(paysAtProperty(manual), true);
});

test("part and full payments recorded later", () => {
  assert.equal(paymentText({ ...manual, paid_cents: 20000 }), "Partially Paid · $650 due");
  assert.equal(paymentText({ ...manual, paid_cents: 85000 }), "Paid");
});

test("website cash bookings with a deposit keep their old wording", () => {
  const web = { ...manual, due_now_cents: 25500 };
  assert.equal(paysAtProperty(web), false);
  assert.equal(methodLabel(web), "Cash at arrival (deposit by Zelle or Venmo)");
  assert.equal(paymentText({ ...web, status: "awaiting_payment" }), "Unpaid · Waiting for payment");
});

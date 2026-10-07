import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentLabel } from "../../lib/booking-ref.ts";
import { methodLabel, paysAtProperty } from "../../lib/payment-rules.ts";

const manual = { status: "confirmed", payment_method: "cash" as const, payment_status: "none", total_cents: 85000, paid_cents: 0, due_now_cents: 0 };

test("a manual reservation with nothing paid shows the balance due at the property", () => {
  assert.deepEqual(paymentLabel(manual), { label: "Unpaid, $850 due at the property", tone: "warn" });
  assert.equal(methodLabel(manual), "Pay at the property");
  assert.equal(paysAtProperty(manual), true);
});

test("part and full payments recorded later", () => {
  assert.equal(paymentLabel({ ...manual, paid_cents: 20000 }).label, "Partly paid, $650 due");
  assert.equal(paymentLabel({ ...manual, paid_cents: 85000 }).label, "Paid in full");
});

test("website cash bookings with a deposit keep their old wording", () => {
  const web = { ...manual, due_now_cents: 25500 };
  assert.equal(paysAtProperty(web), false);
  assert.equal(methodLabel(web), "Cash at arrival (deposit by Zelle or Venmo)");
  assert.equal(paymentLabel({ ...web, status: "awaiting_payment" }).label, "Waiting for payment");
});

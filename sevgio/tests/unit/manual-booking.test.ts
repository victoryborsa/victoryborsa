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
  assert.equal(paymentText({ ...manual, paid_cents: 85000 }), "Paid in Full");
});

test("website cash bookings with a deposit keep their old wording", () => {
  const web = { ...manual, due_now_cents: 25500 };
  assert.equal(paysAtProperty(web), false);
  assert.equal(methodLabel(web), "Cash at arrival (deposit by Zelle or Venmo)");
  assert.equal(paymentText({ ...web, status: "awaiting_payment" }), "Unpaid · Waiting for payment");
});

test("corporate housing: fixed price with a deposit and a due date", async () => {
  const { bookingCardFee, corporateDue } = await import("../../lib/payment-rules.ts");
  const corp = { status: "confirmed", payment_method: null, payment_status: "none", total_cents: 300000, paid_cents: 0, due_now_cents: 50000, deposit_due_cents: 50000, payment_due_date: "2026-11-01", card_fee_flat_cents: 300 };
  assert.equal(paymentText(corp), "Unpaid · $500 deposit due now, $3,000 in all by Nov 1, 2026");
  assert.deepEqual(corporateDue(corp), { balance: 300000, depositLeft: 50000 });
  // The $3 card fee is flat: $2,503 for the $2,500 balance, whatever the amount.
  assert.equal(bookingCardFee(corp, 250000, { card_fee_percent: 2.9, card_fee_fixed_cents: 30 }), 300);
  assert.equal(bookingCardFee({ card_fee_flat_cents: null }, 10000, { card_fee_percent: 0, card_fee_fixed_cents: 30 }), 30);
  assert.equal(paymentText({ ...corp, paid_cents: 20000 }), "Partially Paid · $2,800 due by Nov 1, 2026");
  assert.equal(paymentText({ ...corp, paid_cents: 50000, payment_status: "deposit_paid" }), "Deposit Paid · $2,500 due by Nov 1, 2026");
  assert.deepEqual(corporateDue({ ...corp, paid_cents: 50000 }), { balance: 250000, depositLeft: 0 });
  assert.equal(paymentText({ ...corp, paid_cents: 300000, payment_status: "paid" }), "Paid in Full");
});

test("the calendar link knows which site read it", async () => {
  const { siteFromAgent } = await import("../../lib/ical-fetches.ts");
  assert.equal(siteFromAgent("Airbnb/1.0 (calendar sync)"), "Airbnb");
  assert.equal(siteFromAgent("Booking.com iCal importer"), "Booking.com");
  assert.equal(siteFromAgent("HomeAway iCal fetcher"), "Vrbo");
  assert.equal(siteFromAgent("FurnishedFinder/2"), "Furnished Finder");
  assert.equal(siteFromAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130 Safari/537.36"), "Web browser");
  assert.equal(siteFromAgent("Go-http-client/1.1"), "Other calendar");
  assert.equal(siteFromAgent(""), null);
});

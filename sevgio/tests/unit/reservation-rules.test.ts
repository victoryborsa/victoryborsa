import { test } from "node:test";
import assert from "node:assert/strict";
import { dayRole, editRule, groupReservations, inScope } from "../../lib/reservation-rules.ts";
import { todayLocal } from "../../lib/dates.ts";

test("only unpaid Sevgio.com bookings are editable, past ones included", () => {
  assert.equal(editRule({ source: "direct", status: "confirmed", payment_status: "none", paid_cents: 0 }).editable, true);
  assert.equal(editRule({ source: "direct", status: "awaiting_payment", payment_status: "pending", paid_cents: 0 }).editable, true);
  // Paid, partly paid, processing or refunded: read-only.
  assert.equal(editRule({ source: "direct", status: "confirmed", payment_status: "paid", paid_cents: 90000 }).editable, false);
  assert.equal(editRule({ source: "direct", status: "confirmed", payment_status: "deposit_paid", paid_cents: 10000 }).editable, false);
  assert.equal(editRule({ source: "direct", status: "confirmed", payment_status: "none", paid_cents: 500 }).editable, false);
  assert.equal(editRule({ source: "direct", status: "confirmed", payment_status: "processing", paid_cents: 0 }).editable, false);
  assert.equal(editRule({ source: "direct", status: "cancelled", payment_status: "none", paid_cents: 0 }).editable, false);
});

test("reservations from other sites and calendar blocks are always read-only, even with no payment details", () => {
  for (const status of ["confirmed", "cancelled", "pending"]) {
    assert.equal(editRule({ source: "external", status }).editable, false);
    assert.equal(editRule({ source: "external", status, payment_status: null, paid_cents: null }).editable, false);
    assert.equal(editRule({ source: "block", status, paid_cents: 0 }).editable, false);
  }
});

test("Today on Oct 8: arrivals, current stays and checkouts only; finished stays from Oct 1-4 are left out", () => {
  const day = "2026-10-08";
  const s = (from: string, to: string, status = "confirmed") => ({ from, to, status });
  assert.equal(inScope("today", s("2026-10-01", "2026-10-05"), day), false);
  assert.equal(inScope("today", s("2026-10-03", "2026-10-04"), day), false);
  assert.equal(inScope("today", s("2026-10-05", "2026-10-12"), day), true); // started earlier, still staying
  assert.equal(inScope("today", s("2026-10-08", "2026-10-10"), day), true); // arriving today
  assert.equal(inScope("today", s("2026-10-06", "2026-10-08"), day), true); // leaving today
  assert.equal(inScope("today", s("2026-10-09", "2026-10-11"), day), false); // tomorrow
  assert.equal(inScope("today", s("2026-10-05", "2026-10-12", "cancelled"), day), false);
  assert.equal(dayRole(s("2026-10-05", "2026-10-12"), day), "staying");
  assert.equal(dayRole(s("2026-10-08", "2026-10-10"), day), "arriving");
  assert.equal(dayRole(s("2026-10-06", "2026-10-08"), day), "leaving");
});

test("Upcoming keeps today's stays and checkouts and the future; History has finished and cancelled stays", () => {
  const day = "2026-10-08";
  assert.equal(inScope("upcoming", { from: "2026-10-01", to: "2026-10-05", status: "confirmed" }, day), false);
  assert.equal(inScope("upcoming", { from: "2026-10-06", to: "2026-10-08", status: "confirmed" }, day), true);
  assert.equal(inScope("upcoming", { from: "2026-11-01", to: "2026-11-05", status: "confirmed" }, day), true);
  assert.equal(inScope("history", { from: "2026-10-01", to: "2026-10-05", status: "confirmed" }, day), true);
  assert.equal(inScope("history", { from: "2026-10-06", to: "2026-10-08", status: "confirmed" }, day), false);
  assert.equal(inScope("history", { from: "2026-11-01", to: "2026-11-05", status: "cancelled" }, day), true);
});

test("today is Pittsburgh's date: 11:30 pm in Pittsburgh is still that day, even though it's already tomorrow in UTC", () => {
  assert.equal(todayLocal("America/New_York", new Date("2026-10-09T03:30:00Z")), "2026-10-08");
  assert.equal(todayLocal("America/New_York", new Date("2026-10-09T04:30:00Z")), "2026-10-09");
});

test("cards are grouped by date, then by property; sites that never said when it was booked go last", () => {
  const c = (from: string, booked: string | null, home: string, label: string) => ({ from, booked, home, place: home, label });
  const items = [c("2026-10-09", "2026-09-01", "North Shore Nest", "B"), c("2026-10-08", null, "Cozy Stay", "A"), c("2026-10-09", "2026-09-20", "Cozy Stay", "C"), c("2026-10-09", "2026-09-20", "North Shore Nest", "D")];
  const byArrival = groupReservations(items, "arrival", "upcoming");
  assert.deepEqual(byArrival.map(g => g.date), ["2026-10-08", "2026-10-09"]);
  assert.deepEqual(byArrival[1].homes.map(h => [h.home, h.items.map(i => i.label)]), [["Cozy Stay", ["C"]], ["North Shore Nest", ["B", "D"]]]);
  const byBooked = groupReservations(items, "booked", "upcoming");
  assert.deepEqual(byBooked.map(g => g.date), ["2026-09-20", "2026-09-01", null]);
});

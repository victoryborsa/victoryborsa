import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutLimit, checkoutLimitNote, dayLook, pickDay, validRange, type RangeRules } from "../../lib/date-range.ts";

const today = "2026-10-07";
const rules: RangeRules = { min: today, taken: new Set(["2026-10-20", "2026-10-21"]), minNights: 2, maxNights: 30 };
const empty = { ci: "", co: "" };

test("picking check-in moves straight on to check-out; picking check-out finishes", () => {
  const a = pickDay("2026-10-15", "ci", empty, rules);
  assert.deepEqual(a, { ci: "2026-10-15", co: "", phase: "co", done: false });
  const b = pickDay("2026-10-18", "co", a, rules);
  assert.deepEqual(b, { ci: "2026-10-15", co: "2026-10-18", phase: "co", done: true });
});

test("check-out can't be before check-in, inside the minimum stay, or across a booked night", () => {
  const cur = { ci: "2026-10-15", co: "" };
  assert.equal(dayLook("2026-10-14", "co", cur, rules).disabled, true); // before check-in
  assert.equal(dayLook("2026-10-16", "co", cur, rules).disabled, true); // 1 night < 2-night minimum
  assert.equal(dayLook("2026-10-17", "co", cur, rules).disabled, false);
  assert.equal(dayLook("2026-10-20", "co", cur, rules).disabled, false); // leave the morning the booked night starts
  assert.match(dayLook("2026-10-20", "co", cur, rules).className, /checkout-ok/);
  assert.equal(dayLook("2026-10-22", "co", cur, rules).disabled, true); // would include booked nights
  // A disabled day can't be forced through pickDay either.
  assert.deepEqual(pickDay("2026-10-14", "co", cur, rules).co, "");
  assert.equal(pickDay("2026-10-22", "co", cur, rules).done, false);
});

test("past days and booked nights can't be check-in", () => {
  assert.equal(dayLook("2026-10-06", "ci", empty, rules).disabled, true);
  assert.equal(dayLook("2026-10-20", "ci", empty, rules).disabled, true);
  assert.equal(dayLook("2026-10-22", "ci", empty, rules).disabled, false);
});

test("the whole stay is highlighted, and previewed while choosing check-out", () => {
  const stay = { ci: "2026-10-10", co: "2026-10-13" };
  assert.match(dayLook("2026-10-10", "ci", stay, rules).className, /sel start/);
  assert.match(dayLook("2026-10-11", "ci", stay, rules).className, /\bin\b/);
  assert.match(dayLook("2026-10-13", "ci", stay, rules).className, /sel end/);
  const half = { ci: "2026-10-10", co: "" };
  assert.match(dayLook("2026-10-12", "co", half, rules, "2026-10-14").className, /\bin\b/);
  assert.equal(dayLook("2026-10-12", "co", half, rules).className, "");
});

test("same-day ranges for events and reports; past dates when no minimum is set", () => {
  const r: RangeRules = { minNights: 0 };
  assert.equal(pickDay("2025-01-05", "co", { ci: "2025-01-05", co: "" }, r).done, true);
  assert.equal(validRange({ ci: "2024-03-01", co: "2024-03-31" }, r), true);
  assert.equal(validRange({ ci: "2026-10-15", co: "2026-10-22" }, rules), false);
  assert.equal(validRange({ ci: "2026-10-15", co: "2026-10-20" }, rules), true);
});

test("the picker says why later check-out days are greyed out", () => {
  // Booked the nights of Nov 25 and 26 (a stay Nov 25 to 27): from Nov 1, Nov 25 is the last check-out.
  const r: RangeRules = { min: "2026-10-09", taken: new Set(["2026-11-25", "2026-11-26"]), minNights: 1, maxNights: 60 };
  assert.deepEqual(checkoutLimit("2026-11-01", r), { last: "2026-11-25", why: "booked", bookedTo: "2026-11-27" });
  assert.equal(dayLook("2026-11-25", "co", { ci: "2026-11-01", co: "" }, r).disabled, false);
  assert.equal(dayLook("2026-12-01", "co", { ci: "2026-11-01", co: "" }, r).disabled, true);
  assert.match(checkoutLimitNote("2026-11-01", r), /booked from Nov 25 until Nov 27, so the latest check-out for this stay is Wed, Nov 25\. For a longer stay, pick a check-in from Nov 27 or later\./);
  // After the booking, the home's longest stay is what stops it.
  assert.match(checkoutLimitNote("2026-11-27", r), /up to 60 nights, so the latest check-out is Tue, Jan 26/);
  // Pickers that aren't for a home (reports, Go to date) say nothing.
  assert.equal(checkoutLimitNote("2026-11-01", { maxNights: 60 }), "");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemand, holidays, nightPrice } from "../../lib/smart-pricing.ts";
import { quote } from "../../lib/pricing.ts";

test("holidays: Thanksgiving, Memorial and Labor Day weekends fall on the right dates", () => {
  const h = holidays(2026);
  assert.equal(h["2026-11-26"], "Thanksgiving");
  assert.equal(h["2026-05-23"], "Memorial Day weekend"); // Memorial Day is May 25, 2026
  assert.equal(h["2026-09-05"], "Labor Day weekend");    // Labor Day is Sep 7, 2026
  assert.equal(h["2026-12-25"], "Christmas Day");
});

test("demand: a Steelers game is a red-circle day; one small concert isn't", () => {
  const d = buildDemand([
    { date: "2026-11-08", title: "Steelers vs. Ravens", team: "steelers", featured: false },
    { date: "2026-11-10", title: "Small show", team: null, featured: false },
  ], "2026-11-01", "2026-12-01");
  assert.equal(d["2026-11-08"].pct, 30);
  assert.equal(d["2026-11-08"].notable, true);
  assert.deepEqual(d["2026-11-08"].reasons, ["Steelers vs. Ravens"]);
  assert.equal(d["2026-11-10"].notable, false);
  assert.equal(d["2026-11-26"].notable, true); // Thanksgiving
});

test("smart night price: demand, weekends and last-minute, kept between min and max", () => {
  const p = { nightly_price_cents: 10000, smart_pricing: true, min_price_cents: 9000, max_price_cents: 14900,
    demand: { "2026-11-08": { pct: 30, reasons: [], notable: true }, "2026-11-13": { pct: 60, reasons: [], notable: true } } };
  const today = "2026-11-01";
  assert.equal(nightPrice(p, "2026-11-09", today), 10000);   // Monday, nothing on
  assert.equal(nightPrice(p, "2026-11-08", today), 13000);   // Sunday Steelers game +30%
  assert.equal(nightPrice(p, "2026-11-07", today), 11000);   // Saturday +10%
  assert.equal(nightPrice(p, "2026-11-13", today), 14900);   // Friday +70% → capped at the maximum
  assert.equal(nightPrice(p, "2026-11-02", today), 9000);    // tomorrow, -10% → the minimum
  assert.equal(nightPrice({ ...p, smart_pricing: false }, "2026-11-08", today), 10000);
});

test("quote adds up each night's smart price", () => {
  const p = { nightly_price_cents: 10000, cleaning_fee_cents: 0, max_guests: 2, smart_pricing: true, min_price_cents: 5000, max_price_cents: 20000,
    demand: { "2026-11-08": { pct: 30, reasons: [], notable: true } } };
  const q = quote(p, "2026-11-07", "2026-11-10", 0, undefined, "2026-10-01"); // Sat +10%, Sun +30%, Mon
  assert.equal(q.base, 11000 + 13000 + 10000);
  assert.equal(q.nightly, Math.round(34000 / 3));
  assert.equal(q.smart, true);
});

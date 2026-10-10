import { test } from "node:test";
import assert from "node:assert/strict";
import { GAME_EVE_PCT, buildDemand, eventWeight, holidays, nightPrice, priceWhy } from "../../lib/smart-pricing.ts";
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

test("monthly rent: whole months plus rent ÷ 30 per extra day, all-inclusive", () => {
  const p = { nightly_price_cents: 3317, monthly_price_cents: 99500, cleaning_fee_cents: 0, max_guests: 2 };
  const one = quote(p, "2026-11-01", "2026-12-01", 0, { adults: 2, children: 0, free_children: 0 });
  assert.equal(one.months, 1);
  assert.equal(one.extraDays, 0);
  assert.equal(one.total, 99500);
  assert.equal(quote(p, "2026-11-01", "2026-12-01", 7).total, 99500); // no lodging tax on 30+ night stays
  const more = quote(p, "2026-11-01", "2027-01-05", 0); // 65 nights = 2 months + 5 days
  assert.equal(more.months, 2);
  assert.equal(more.extraDays, 5);
  assert.equal(more.base, 2 * 99500 + Math.round((5 * 99500) / 30));
});

test("events: Steelers, Penguins and Pirates home games, stadium and arena concerts weigh more; road games count for nothing", () => {
  assert.equal(eventWeight({ title: "Pittsburgh Steelers vs. Baltimore Ravens", team: "steelers", featured: false }), 30);
  assert.equal(eventWeight({ title: "Pittsburgh Penguins vs. Philadelphia Flyers", team: "penguins", featured: false }), 12);
  assert.equal(eventWeight({ title: "Pittsburgh Pirates vs. Chicago Cubs", team: "pirates", featured: false }), 8);
  assert.equal(eventWeight({ title: "Steelers at Ravens", team: "steelers", featured: false }), 0);
  assert.equal(eventWeight({ title: "Ravens at Steelers", team: "steelers", featured: false }), 30);
  assert.equal(eventWeight({ title: "Pirates vs. Cubs at PNC Park", team: "pirates", featured: false }), 8);
  assert.equal(eventWeight({ title: "Taylor Swift", team: null, featured: false, category: "Music", venue: "Acrisure Stadium" }), 25);
  assert.equal(eventWeight({ title: "Big Arena Show", team: null, featured: false, category: "Music", venue: "PPG Paints Arena" }), 15);
  assert.equal(eventWeight({ title: "Small club show", team: null, featured: false, category: "Music", venue: "Thunderbird Cafe" }), 3);
});

test("demand: the night before a Steelers home game goes up too; busy Sevgio nights add a little", () => {
  const d = buildDemand([{ date: "2026-11-08", title: "Steelers vs. Ravens", team: "steelers", featured: false }], "2026-11-01", "2026-12-01",
    { "2026-11-12": 0.85, "2026-11-13": 0.65, "2026-11-14": 0.4 });
  assert.equal(d["2026-11-07"].pct, GAME_EVE_PCT);
  assert.equal(d["2026-11-12"].pct, 10);
  assert.equal(d["2026-11-13"].pct, 5);
  assert.equal(d["2026-11-14"], undefined);
  assert.equal(d["2026-11-12"].notable, false);
});

test("nights priced by hand win over Smart Pricing and the normal price, with no last-minute discount", () => {
  const p = { nightly_price_cents: 10000, smart_pricing: true, min_price_cents: 9000, max_price_cents: 14900,
    demand: { "2026-11-08": { pct: 30, reasons: ["Steelers vs. Ravens"], notable: true } }, prices: { "2026-11-08": 12500, "2026-11-02": 11000 } };
  assert.equal(nightPrice(p, "2026-11-08", "2026-11-01"), 12500);
  assert.equal(nightPrice(p, "2026-11-02", "2026-11-01"), 11000); // tomorrow, but the host's own price
  assert.equal(nightPrice({ ...p, smart_pricing: false }, "2026-11-08", "2026-11-01"), 12500);
  assert.match(priceWhy(p, "2026-11-08", "2026-11-01"), /Price you set/);
});

test("Smart Pricing never leaves the host's lowest and highest price, whatever the demand", () => {
  const today = "2026-11-01";
  for (const pct of [-50, -10, 0, 10, 40, 80, 200]) {
    for (let i = 0; i < 14; i++) {
      const date = new Date(Date.parse(today + "T12:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
      const price = nightPrice({ nightly_price_cents: 11000, smart_pricing: true, min_price_cents: 9500, max_price_cents: 13500, demand: { [date]: { pct, reasons: [], notable: false } } }, date, today);
      assert.ok(price >= 9500 && price <= 13500, `${date} at ${pct}% gave ${price}`);
    }
  }
});

test("last-minute discount: tonight and the next two nights only, and it says why", () => {
  const p = { nightly_price_cents: 10000, smart_pricing: true, min_price_cents: 5000, max_price_cents: 20000, demand: {} };
  const today = "2026-11-02"; // a Monday
  assert.equal(nightPrice(p, "2026-11-02", today), 9000);
  assert.equal(nightPrice(p, "2026-11-04", today), 9000);
  assert.equal(nightPrice(p, "2026-11-05", today), 10000);
  assert.match(priceWhy(p, "2026-11-03", today), /Last-minute discount/);
});

test("quote lists each night's calendar price; checkout charges exactly their sum", () => {
  const p = { nightly_price_cents: 10000, cleaning_fee_cents: 2500, max_guests: 2, smart_pricing: false, prices: { "2026-11-10": 15000 } };
  const q = quote(p, "2026-11-09", "2026-11-12", 0, undefined, "2026-10-01");
  assert.deepEqual(q.byNight, [{ date: "2026-11-09", cents: 10000 }, { date: "2026-11-10", cents: 15000 }, { date: "2026-11-11", cents: 10000 }]);
  assert.equal(q.base, 35000);
  assert.equal(q.total, 37500);
  assert.equal(quote({ ...p, prices: undefined }, "2026-11-09", "2026-11-12", 0).byNight.length, 0); // one flat price: no list
});

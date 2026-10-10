import { test } from "node:test";
import assert from "node:assert/strict";
import { parseServices, SERVICE_PRICE_PRESETS } from "../../lib/constants.ts";
import { quote } from "../../lib/pricing.ts";

test("early check-in always carries the fixed note, whatever was sent", () => {
  const [s] = parseServices([{ key: "early_checkin", name: "Early check-in", price_cents: 2500, per: "stay", note: "anything" }]);
  assert.equal(s.note, "Subject to availability");
  const [late] = parseServices([{ key: "late_checkout", name: "Late check-out", price_cents: 0, per: "stay", note: "Until 1 pm" }]);
  assert.equal(late.note, "Until 1 pm");
});

test("ride and tour price choices are $80 to $120", () => {
  assert.deepEqual(SERVICE_PRICE_PRESETS.map(c => c / 100), [80, 85, 90, 100, 110, 120]);
});

test("paid services the guest picks are itemized and added to the total; free ones add nothing", () => {
  const p = { nightly_price_cents: 10000, cleaning_fee_cents: 0, max_guests: 2, services: [
    { key: "airport_pickup", name: "Airport pickup", price_cents: 8500, per: "trip", note: "" },
    { key: "early_checkin", name: "Early check-in", price_cents: 0, per: "stay", note: "" },
    { key: "city_tour", name: "Private city tour", price_cents: 12000, per: "trip", note: "" },
  ] };
  const party = { adults: 2, children: 0, free_children: 0, services: ["airport_pickup", "early_checkin"] };
  const q = quote(p as never, "2026-11-02", "2026-11-04", 0, party);
  assert.deepEqual(q.extras.map(x => [x.name, x.total]), [["Airport pickup", 8500], ["Early check-in", 0]]);
  assert.equal(q.extrasTotal, 8500);
  assert.equal(q.total, q.base - q.discount + q.cleaning + q.petFee + q.tax + 8500);
});

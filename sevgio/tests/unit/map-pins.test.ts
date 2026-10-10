import { test } from "node:test";
import assert from "node:assert/strict";
import { AREA_CENTERS, approxPosition } from "../../lib/map-pins.ts";

const meters = (a: [number, number], b: [number, number]) => {
  const dy = (a[0] - b[0]) * 111_320, dx = (a[1] - b[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

test("map pins: near the real spot but never on it; neighborhood when the address isn't found yet", () => {
  const house: [number, number] = [40.4568, -80.0101];
  const p = approxPosition({ id: "a1", lat: house[0], lng: house[1], city: "Pittsburgh", area: "North Side" })!;
  const d = meters(p, house);
  assert.ok(d > 140 && d < 360, `moved ${d} m`);
  // Same listing, same spot every time (pins don't jump around).
  assert.deepEqual(approxPosition({ id: "a1", lat: house[0], lng: house[1], city: "Pittsburgh" }), p);
  // Not looked up yet: its neighborhood, not downtown.
  const east = approxPosition({ id: "b2", lat: null, lng: null, city: "Pittsburgh", area: "East Hills" })!;
  assert.ok(meters(east, AREA_CENTERS["east hills"]) < 360);
  assert.ok(meters(east, AREA_CENTERS["downtown"]) > 5000);
  // A town used as the area (e.g. Swissvale), and Indiana, PA.
  assert.ok(meters(approxPosition({ id: "c3", lat: null, lng: null, city: "Swissvale", area: "" })!, AREA_CENTERS["swissvale"]) < 360);
  assert.ok(approxPosition({ id: "d4", lat: null, lng: null, city: "Indiana", area: "Indiana County" }));
  assert.equal(approxPosition({ id: "e5", lat: null, lng: null, city: "Nowhere", area: "" }), null);
});

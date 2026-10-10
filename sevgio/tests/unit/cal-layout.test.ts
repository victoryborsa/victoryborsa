import { test } from "node:test";
import assert from "node:assert/strict";
import { assignLanes, barLines, groupByArrival, inView, propertyColor, PROPERTY_COLORS } from "../../lib/cal-layout.ts";

test("back-to-back stays share one lane; overlapping stays get their own", () => {
  const a = { id: "a", from: "2026-10-04", to: "2026-10-07" };
  const b = { id: "b", from: "2026-10-07", to: "2026-10-09" }; // arrives the day a leaves
  const c = { id: "c", from: "2026-10-05", to: "2026-10-06" }; // overlaps a
  const { placed, lanes } = assignLanes([b, c, a]);
  const lane = (id: string) => placed.find(p => p.item.id === id)!.lane;
  assert.equal(lanes, 2);
  assert.equal(lane("a"), lane("b"));
  assert.notEqual(lane("a"), lane("c"));
});

test("several arrivals on the same day each get a lane, so none is hidden", () => {
  const same = ["x", "y", "z"].map(id => ({ id, from: "2026-12-19", to: "2026-12-21" }));
  const { placed, lanes } = assignLanes(same);
  assert.equal(lanes, 3);
  assert.deepEqual(new Set(placed.map(p => p.lane)), new Set([0, 1, 2]));
});

test("a room with no stays still gets one row", () => {
  assert.equal(assignLanes([]).lanes, 1);
});

test("bars run from the middle of the arrival day to the middle of the departure day", () => {
  // Week Sun Oct 4 - Sat Oct 10. Day i fills grid lines 2+2i to 4+2i.
  assert.deepEqual(barLines("2026-10-04", 7, { from: "2026-10-05", to: "2026-10-08" }), { from: 5, to: 11, cutL: false, cutR: false });
});

test("stays crossing into the next or previous week are cut at the edge", () => {
  assert.deepEqual(barLines("2026-10-04", 7, { from: "2026-10-01", to: "2026-10-06" }), { from: 2, to: 7, cutL: true, cutR: false });
  assert.deepEqual(barLines("2026-10-04", 7, { from: "2026-10-09", to: "2026-10-13" }), { from: 13, to: 16, cutL: false, cutR: true });
  // Checking out the morning after the last day shown still runs to the edge.
  assert.deepEqual(barLines("2026-10-04", 7, { from: "2026-10-10", to: "2026-10-11" }), { from: 15, to: 16, cutL: false, cutR: true });
  // The same stay shows on the next week too, from the edge to its departure.
  assert.deepEqual(barLines("2026-10-11", 7, { from: "2026-10-09", to: "2026-10-13" }), { from: 2, to: 7, cutL: true, cutR: false });
});

test("a guest leaving on the first day shown still appears (as a departure)", () => {
  assert.equal(inView("2026-10-04", 7, { from: "2026-10-01", to: "2026-10-04" }), true);
  assert.equal(inView("2026-10-04", 7, { from: "2026-10-01", to: "2026-10-03" }), false);
  assert.equal(inView("2026-10-04", 7, { from: "2026-10-11", to: "2026-10-12" }), false);
  assert.equal(inView("2026-10-04", 7, { from: "2026-10-10", to: "2026-10-12" }), true);
});

test("arrivals are grouped by day, earliest first", () => {
  const groups = groupByArrival([
    { from: "2027-05-08", sortKey: "Cozy" },
    { from: "2026-12-19", sortKey: "North Shore" },
    { from: "2026-12-19", sortKey: "Cozy" },
  ]);
  assert.deepEqual(groups.map(g => g.date), ["2026-12-19", "2027-05-08"]);
  assert.deepEqual(groups[0].items.map(i => i.sortKey), ["Cozy", "North Shore"]);
});

test("each listing keeps the same color", () => {
  assert.equal(propertyColor(0), PROPERTY_COLORS[0]);
  assert.equal(propertyColor(PROPERTY_COLORS.length + 2), PROPERTY_COLORS[2]);
});

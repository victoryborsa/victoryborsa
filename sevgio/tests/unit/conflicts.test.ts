import { test } from "node:test";
import assert from "node:assert/strict";
import { clockHours, findConflicts, hoursLabel, sharesNights, type ConflictUnit } from "../../lib/conflict-core.ts";

const unit = (id: string, parent_id: string | null = null, extra: Partial<ConflictUnit> = {}): ConflictUnit =>
  ({ id, parent_id, check_in_time: "3:00 pm", check_out_time: "11:00 am", turnaround_hours: 0, ...extra });
const stay = (key: string, property_id: string, check_in: string, check_out: string, channel = "airbnb") => ({ key, property_id, check_in, check_out, channel });

test("reads check-in and check-out times", () => {
  assert.equal(clockHours("3:00 pm", 0), 15);
  assert.equal(clockHours("11:00 AM", 0), 11);
  assert.equal(clockHours("15:30", 0), 15.5);
  assert.equal(clockHours("noon", 0), 12);
  assert.equal(clockHours("12 am", 5), 0);
  assert.equal(clockHours("flexible", 16), 16);
});

test("a whole house shares nights with its rooms, but rooms don't with each other", () => {
  const house = unit("H"), r1 = unit("R1", "H"), r2 = unit("R2", "H");
  assert.ok(sharesNights(house, r1));
  assert.ok(sharesNights(r2, house));
  assert.ok(!sharesNights(r1, r2));
  assert.ok(!sharesNights(unit("A"), unit("B")));
});

test("overlapping reservations on one listing are a conflict with the shared nights", () => {
  const [c] = findConflicts([unit("A")], [stay("b:1", "A", "2026-10-10", "2026-10-15", "sevgio"), stay("c:2", "A", "2026-10-13", "2026-10-18", "bookingcom")]);
  assert.equal(c.kind, "overlap");
  assert.equal(c.start, "2026-10-13");
  assert.equal(c.end, "2026-10-15");
  assert.equal(c.pair_key, "b:1|c:2");
  assert.deepEqual(c.property_ids, ["A"]);
});

test("a whole-house booking clashes with a room booking inside it; two rooms don't", () => {
  const units = [unit("H"), unit("R1", "H"), unit("R2", "H")];
  const found = findConflicts(units, [stay("c:h", "H", "2026-11-01", "2026-11-05"), stay("b:r1", "R1", "2026-11-03", "2026-11-04", "sevgio"), stay("c:r2", "R2", "2026-11-02", "2026-11-06", "vrbo")]);
  assert.deepEqual(found.map(f => f.pair_key).sort(), ["b:r1|c:h", "c:h|c:r2"]);
  assert.ok(found.every(f => f.kind === "overlap"));
});

test("a normal same-day changeover is not a conflict", () => {
  assert.equal(findConflicts([unit("A")], [stay("c:1", "A", "2026-10-01", "2026-10-05"), stay("c:2", "A", "2026-10-05", "2026-10-09")]).length, 0);
});

test("a changeover shorter than the listing's turnover time is a conflict", () => {
  const units = [unit("A", null, { turnaround_hours: 6 })];
  const [c] = findConflicts(units, [stay("c:1", "A", "2026-10-01", "2026-10-05"), stay("b:2", "A", "2026-10-05", "2026-10-09", "sevgio")]);
  assert.equal(c.kind, "turnaround");
  assert.equal(c.start, "2026-10-05");
  assert.equal(c.gap_hours, 4);
  assert.equal(c.needed_hours, 6);
  // With a day in between there's plenty of time.
  assert.equal(findConflicts(units, [stay("c:1", "A", "2026-10-01", "2026-10-05"), stay("b:2", "A", "2026-10-06", "2026-10-09")]).length, 0);
});

test("a room whose check-in is before the house's check-out conflicts on changeover day", () => {
  const units = [unit("H"), unit("R1", "H", { check_in_time: "10:00 am" })];
  const [c] = findConflicts(units, [stay("c:h", "H", "2026-10-01", "2026-10-05"), stay("b:r", "R1", "2026-10-05", "2026-10-07", "sevgio")]);
  assert.equal(c.kind, "turnaround");
  assert.equal(c.gap_hours, -1);
  assert.equal(hoursLabel(-1), "1 hour too early");
});

test("multi-day turnover is checked across days", () => {
  const units = [unit("A", null, { turnaround_hours: 48 })];
  const found = findConflicts(units, [stay("c:1", "A", "2026-10-01", "2026-10-05"), stay("c:2", "A", "2026-10-06", "2026-10-09")]);
  assert.equal(found[0]?.kind, "turnaround");
  assert.equal(found[0].gap_hours, 28);
});

test("reservations on unknown listings or with no nights are ignored, and order doesn't matter", () => {
  assert.equal(findConflicts([unit("A")], [stay("c:1", "Z", "2026-10-01", "2026-10-05"), stay("c:2", "Z", "2026-10-02", "2026-10-03")]).length, 0);
  const one = findConflicts([unit("A")], [stay("c:9", "A", "2026-10-03", "2026-10-06"), stay("c:1", "A", "2026-10-01", "2026-10-04")]);
  const two = findConflicts([unit("A")], [stay("c:1", "A", "2026-10-01", "2026-10-04"), stay("c:9", "A", "2026-10-03", "2026-10-06")]);
  assert.deepEqual(one, two);
});

test("hour labels read naturally", () => {
  assert.equal(hoursLabel(1), "1 hour");
  assert.equal(hoursLabel(4.5), "4 hours 30 minutes");
  assert.equal(hoursLabel(0), "no time");
});

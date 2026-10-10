import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtWhen, localDateOf, toInstant } from "../../lib/dates.ts";

test("timestamps work whether the database gives a Date, text, or nothing", () => {
  const at = new Date("2026-10-06T04:30:00Z"); // 12:30 AM in Pittsburgh, still Oct 6
  assert.equal(localDateOf(at), "2026-10-06");
  assert.equal(localDateOf("2026-10-06T04:30:00Z"), "2026-10-06");
  assert.equal(localDateOf("2026-10-06T03:30:00Z"), "2026-10-05"); // 11:30 PM the evening before
  assert.equal(localDateOf(at.getTime()), "2026-10-06");
  for (const empty of [null, undefined, "", "not a date", new Date("nope")]) {
    assert.equal(toInstant(empty), null);
    assert.equal(localDateOf(empty), null);
    assert.equal(fmtWhen(empty), "");
  }
  assert.equal(fmtWhen(at), fmtWhen("2026-10-06T04:30:00.000Z"));
  assert.match(fmtWhen(at), /^Oct 6, 2026, 12:30\sAM$/);
  assert.match(fmtWhen(at, "short"), /^Oct 6, 12:30\sAM$/);
});

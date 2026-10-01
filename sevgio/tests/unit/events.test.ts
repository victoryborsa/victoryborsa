import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEventIcs, teamOf, timeLabel } from "../../lib/events-ics.ts";

test("reads event calendars: UTC, local and all-day times, folded lines, places and links", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT", "UID:g1", "SUMMARY:Pirates vs. Cubs", "DTSTART:20260415T230500Z", "DTEND:20260416T020000Z", "LOCATION:PNC Park\\, 115 Federal St", "URL:https://example.com/g1", "END:VEVENT",
    "BEGIN:VEVENT", "UID:g2", "SUMMARY:Penguins vs. Flyers", "DTSTART;TZID=America/New_York:20261003T190000", "END:VEVENT",
    "BEGIN:VEVENT", "UID:f1", "SUMMARY:Picklesburgh", "DTSTART;VALUE=DATE:20260717", "DTEND;VALUE=DATE:20260720", "DESCRIPTION:A very long", " folded line", "END:VEVENT",
    "BEGIN:VEVENT", "UID:bad", "SUMMARY:No date", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const ev = parseEventIcs(ics);
  assert.equal(ev.length, 3);
  // 23:05 UTC in April is 7:05 PM in Pittsburgh (daylight time).
  assert.deepEqual({ ...ev[0] }, { uid: "g1", title: "Pirates vs. Cubs", date: "2026-04-15", end: null, time: "19:05", venue: "PNC Park", url: "https://example.com/g1" });
  assert.equal(ev[1].time, "19:00");
  assert.equal(ev[1].date, "2026-10-03");
  // All-day end dates are exclusive: Jul 17–19.
  assert.deepEqual([ev[2].date, ev[2].end, ev[2].time], ["2026-07-17", "2026-07-19", ""]);
});

test("time labels and team detection", () => {
  assert.equal(timeLabel("19:00"), "7 PM");
  assert.equal(timeLabel("12:30"), "12:30 PM");
  assert.equal(timeLabel("00:15"), "12:15 AM");
  assert.equal(timeLabel(""), "");
  assert.equal(teamOf("Pittsburgh Steelers vs. Baltimore Ravens"), "steelers");
  assert.equal(teamOf("Rod Wave"), null);
});

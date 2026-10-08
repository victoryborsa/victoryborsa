import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByHost } from "../../lib/host-groups.ts";

const rows = [
  { host_id: "g", host_name: "Gerimeca", title: "Cozy 3BR House with Garage" },
  { host_id: "i", host_name: "Ilkay", title: "Cozy Stay – Twin Room" },
  { host_id: "m", host_name: "Gamalat", title: "Meadow Wood House – Queen Room 2" },
  { host_id: "i", host_name: "Ilkay", title: "Charming Tudor-Style Cottage – 3 Bedroom Apt" },
  { host_id: "m", host_name: "Gamalat", title: "Meadow Wood House – Entire Home" },
  { host_id: "i", host_name: "ilkay", title: "cozy Stay – Family Room" },
];

test("listings group under hosts A–Z, each host's listings A–Z", () => {
  const { groups, hosts, selected } = groupByHost(rows);
  assert.equal(selected, "");
  assert.deepEqual(groups.map(g => g.hostName), ["Gamalat", "Gerimeca", "Ilkay"]);
  assert.deepEqual(groups[2].rows.map(r => r.title), ["Charming Tudor-Style Cottage – 3 Bedroom Apt", "cozy Stay – Family Room", "Cozy Stay – Twin Room"]);
  assert.deepEqual(hosts.map(h => [h.id, h.count]), [["m", 2], ["g", 1], ["i", 3]]);
});

test("host filter keeps one host; an unknown host shows everyone", () => {
  assert.deepEqual(groupByHost(rows, "g").groups.map(g => g.hostName), ["Gerimeca"]);
  assert.equal(groupByHost(rows, "g").hosts.length, 3);
  const none = groupByHost(rows, "nobody");
  assert.equal(none.selected, "");
  assert.equal(none.groups.length, 3);
});

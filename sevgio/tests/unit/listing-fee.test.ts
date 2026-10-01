import { test } from "node:test";
import assert from "node:assert/strict";
import { feeState } from "../../lib/listing-fee-state.ts";

test("listing fee: off, admin-owned, waived, paid and due", () => {
  const row = (paid: string | null, waived = false, role = "host") => ({ listing_paid_until: paid, listing_fee_waived: waived, host_role: role });
  const today = "2026-10-01";
  assert.equal(feeState(row(null), false, today), "off");
  assert.equal(feeState(row(null, false, "admin"), true, today), "admin");
  assert.equal(feeState(row(null, true), true, today), "waived");
  assert.equal(feeState(row("2026-10-01"), true, today), "paid");
  assert.equal(feeState(row("2026-09-30"), true, today), "due");
  assert.equal(feeState(row(null), true, today), "due");
});

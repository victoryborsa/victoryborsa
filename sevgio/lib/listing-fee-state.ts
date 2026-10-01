import { todayLocal } from "./dates.ts";

export type FeeState = "off" | "admin" | "waived" | "paid" | "due";
export type FeeRow = { listing_paid_until: string | null; listing_fee_waived: boolean; host_role: string };

/** Whether a listing's yearly fee is settled. Admin-owned listings never pay; "due" means it can't be published by its host. */
export function feeState(r: FeeRow, enabled: boolean, today = todayLocal()): FeeState {
  if (!enabled) return "off";
  if (r.host_role === "admin") return "admin";
  if (r.listing_fee_waived) return "waived";
  return r.listing_paid_until && r.listing_paid_until >= today ? "paid" : "due";
}

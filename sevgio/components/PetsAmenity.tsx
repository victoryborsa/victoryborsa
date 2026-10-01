"use client";
import { useState } from "react";
import { PET_FEE_PER } from "@/lib/pricing.ts";

/** "Pets allowed" amenity. When ticked, the host chooses free or a fee, and how the fee is charged. */
export function PetsAmenity({ label, checked, fee, per }: { label: string; checked: boolean; fee: string; per: string }) {
  const [on, setOn] = useState(checked);
  const [mode, setMode] = useState(fee && fee !== "0" ? "fee" : "free");
  return (
    <div className="pets-amenity" style={on ? { gridColumn: "1 / -1" } : undefined}>
      <label className="chk"><input type="checkbox" name="amenities" value="pets" checked={on} onChange={e => setOn(e.target.checked)} />{label}</label>
      {on && (
        <div className="pets-options">
          <label className="chk"><input type="radio" name="pet_fee_mode" value="free" checked={mode === "free"} onChange={() => setMode("free")} />Free</label>
          <label className="chk"><input type="radio" name="pet_fee_mode" value="fee" checked={mode === "fee"} onChange={() => setMode("fee")} />Charge a pet fee</label>
          {mode === "fee" && (
            <div className="row" style={{ gap: 8 }}>
              <label className="field" style={{ width: 140 }}><span>Pet fee (USD)</span><input className="input mono" name="pet_fee" inputMode="decimal" defaultValue={fee && fee !== "0" ? fee : ""} placeholder="25" /></label>
              <label className="field"><span>How the pet fee is charged</span>
                <select className="input" name="pet_fee_per" defaultValue={per || "stay"}>
                  {Object.entries(PET_FEE_PER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

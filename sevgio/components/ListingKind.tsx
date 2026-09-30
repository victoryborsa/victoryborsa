"use client";
import { useState } from "react";
import { PROPERTY_TYPES } from "@/lib/constants.ts";

/** "Whole place or private room?" If it's a room, asks which house it's in, so the calendars can be linked. */
export function ListingKind({ propertyType, parentId, homes }: { propertyType?: string; parentId?: string | null; homes: { id: string; title: string; host_name?: string }[] }) {
  const [kind, setKind] = useState<"home" | "room">(parentId || propertyType === "room" ? "room" : "home");
  const homeTypes = Object.entries(PROPERTY_TYPES).filter(([k]) => k !== "room");
  return (
    <div className="stack">
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
        <legend style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>What are you listing?</legend>
        <label className="chk"><input type="radio" name="listing_kind" value="home" checked={kind === "home"} onChange={() => setKind("home")} /><span><b>The whole place</b>: guests get the entire home</span></label>
        <label className="chk"><input type="radio" name="listing_kind" value="room" checked={kind === "room"} onChange={() => setKind("room")} /><span><b>A private room</b>: guests rent one room</span></label>
      </fieldset>
      {kind === "home" ? (
        <label className="field"><span>Type of place</span>
          <select className="input" name="property_type" defaultValue={propertyType && propertyType !== "room" ? propertyType : "house"}>{homeTypes.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
      ) : (
        <>
          <input type="hidden" name="property_type" value="room" />
          <label className="field"><span>Which house is this room in?</span>
            <select className="input" name="parent_id" defaultValue={parentId || ""}>
              <option value="">The whole house isn't listed (rooms only)</option>
              {homes.map(h => <option key={h.id} value={h.id}>{h.title}{h.host_name ? ` (${h.host_name})` : ""}</option>)}
            </select>
            <span className="hint">If the whole house is also listed, pick it here. Then booking the house blocks this room, and booking this room blocks the house.</span>
          </label>
        </>
      )}
    </div>
  );
}

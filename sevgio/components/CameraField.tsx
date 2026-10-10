"use client";
import { useState } from "react";

export function CameraField({ has, locations }: { has: boolean; locations: string }) {
  const [on, setOn] = useState(has);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="chk"><input type="checkbox" name="has_exterior_cameras" checked={on} onChange={e => setOn(e.target.checked)} />There are exterior security cameras</label>
      {on && (
        <label className="field"><span>Where are they? (shown to guests before they book)</span>
          <input className="input" name="camera_locations" defaultValue={locations} placeholder="e.g. Front door and driveway. None inside the house." />
        </label>
      )}
    </div>
  );
}

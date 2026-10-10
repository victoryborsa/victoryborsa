"use client";
import { useState } from "react";
import { MATTRESS_SIZES, SLEEPING_OPTIONS, type BedItem, type RoomDetail } from "@/lib/constants.ts";

const blank = (n: number): RoomDetail => ({ name: `Bedroom ${n}`, sqft: null, beds: [{ kind: "bed", size: "queen", count: 1 }], note: "", photo: "" });

/** Bedroom-by-bedroom details for guests. Saved as JSON in a hidden field. */
export function RoomsEditor({ initial, photos }: { initial: RoomDetail[]; photos: { id: string; caption: string }[] }) {
  const [rooms, setRooms] = useState<RoomDetail[]>(initial);
  const set = (i: number, patch: Partial<RoomDetail>) => setRooms(rooms.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setBed = (i: number, k: number, patch: Partial<BedItem>) => set(i, { beds: rooms[i].beds.map((b, j) => (j === k ? { ...b, ...patch } : b)) });
  return (
    <div className="stack" style={{ gap: 12 }}>
      <input type="hidden" name="rooms_json" value={JSON.stringify(rooms)} />
      {rooms.map((r, i) => (
        <fieldset key={i} className="room-edit">
          <legend>{r.name || `Bedroom ${i + 1}`}</legend>
          <div className="grid-2">
            <label className="field"><span>Room name</span><input className="input" value={r.name} maxLength={60} onChange={e => set(i, { name: e.target.value })} placeholder="Bedroom 1 / Family Room" /></label>
            <label className="field"><span>Room size (sq ft, optional)</span><input className="input mono" inputMode="numeric" value={r.sqft ?? ""} onChange={e => set(i, { sqft: Number(e.target.value.replace(/\D/g, "")) || null })} placeholder="192" /></label>
          </div>
          <div className="field">
            <span>Beds in this room</span>
            {r.beds.map((b, k) => (
              <div key={k} className="row" style={{ gap: 8 }}>
                <input className="input mono" type="number" min={1} max={10} value={b.count} onChange={e => setBed(i, k, { count: Number(e.target.value) || 1 })} aria-label={`How many (${r.name}, bed ${k + 1})`} style={{ width: 70 }} />
                <span>×</span>
                <select className="input" value={b.kind} onChange={e => setBed(i, k, { kind: e.target.value, size: e.target.value === "crib" ? "" : b.size || "queen" })} aria-label={`Bed type (${r.name}, bed ${k + 1})`} style={{ width: "auto", minWidth: 140 }}>
                  {Object.entries(SLEEPING_OPTIONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {b.kind !== "crib" && (
                  <select className="input" value={b.size} onChange={e => setBed(i, k, { size: e.target.value })} aria-label={`Mattress size (${r.name}, bed ${k + 1})`} style={{ width: "auto", minWidth: 210 }}>
                    {Object.entries(MATTRESS_SIZES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                )}
                <button type="button" className="btn btn-ghost btn-sm" disabled={r.beds.length === 1} onClick={() => set(i, { beds: r.beds.filter((_, j) => j !== k) })}>Remove</button>
              </div>
            ))}
            <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => set(i, { beds: [...r.beds, { kind: "bed", size: "twin", count: 1 }] })}>+ Add a bed</button></div>
          </div>
          <label className="field"><span>Note for guests (optional)</span><input className="input" value={r.note} maxLength={200} onChange={e => set(i, { note: e.target.value })} placeholder="Private bathroom, smart TV, closet, garden view" /></label>
          <label className="field"><span>Photo of this room</span>
            {photos.length ? (
              <select className="input" value={r.photo} onChange={e => set(i, { photo: e.target.value })}>
                <option value="">No photo</option>
                {photos.map((p, n) => <option key={p.id} value={p.id}>Photo {n + 1}{p.caption ? `: ${p.caption}` : ""}</option>)}
              </select>
            ) : <span className="hint">Upload the listing's photos first, then pick one for each room here.</span>}
          </label>
          <div><button type="button" className="btn btn-danger btn-sm" onClick={() => setRooms(rooms.filter((_, j) => j !== i))}>Remove this bedroom</button></div>
        </fieldset>
      ))}
      <div><button type="button" className="btn btn-ghost" onClick={() => setRooms([...rooms, blank(rooms.length + 1)])}>+ Add a bedroom</button></div>
    </div>
  );
}

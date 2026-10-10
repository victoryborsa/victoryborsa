"use client";
import { useState } from "react";
import { MATTRESS_SIZES, SLEEPING_OPTIONS, type BedItem } from "@/lib/constants.ts";

/** Rows of "count × bed type (mattress size)". Saved as JSON in a hidden field. */
export function BedsEditor({ initial }: { initial: BedItem[] }) {
  const [rows, setRows] = useState<BedItem[]>(initial.length ? initial : [{ kind: "bed", size: "queen", count: 1 }]);
  const set = (i: number, patch: Partial<BedItem>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="beds_json" value={JSON.stringify(rows)} />
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ gap: 8 }}>
          <input className="input mono" type="number" min={1} max={20} value={r.count} onChange={e => set(i, { count: Number(e.target.value) || 1 })} aria-label={`How many (row ${i + 1})`} style={{ width: 70 }} />
          <span>×</span>
          <select className="input" value={r.kind} onChange={e => set(i, { kind: e.target.value, size: e.target.value === "crib" ? "" : r.size || "queen" })} aria-label={`Type (row ${i + 1})`} style={{ width: "auto", minWidth: 150 }}>
            {Object.entries(SLEEPING_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {r.kind !== "crib" && (
            <select className="input" value={r.size} onChange={e => set(i, { size: e.target.value })} aria-label={`Mattress size (row ${i + 1})`} style={{ width: "auto", minWidth: 220 }}>
              {Object.entries(MATTRESS_SIZES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1} aria-label={`Remove row ${i + 1}`}>Remove</button>
        </div>
      ))}
      <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows([...rows, { kind: "bed", size: "queen", count: 1 }])}>+ Add another bed</button></div>
    </div>
  );
}

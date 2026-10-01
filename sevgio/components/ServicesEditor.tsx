"use client";
import { useState } from "react";
import { SERVICE_DEFAULTS, SERVICE_PER, SERVICE_PRESETS, type Service } from "@/lib/constants.ts";

const dollars = (c: number) => (c ? (c / 100).toFixed(2).replace(/\.00$/, "") : "");
const cents = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^0-9.]/g, "")) * 100) || 0);

/** Extras: tick a ready-made service or add your own, then set its price. Saved as JSON in a hidden field. */
export function ServicesEditor({ initial }: { initial: Service[] }) {
  const [list, setList] = useState<Service[]>(initial);
  const has = (key: string) => list.some(x => x.key === key);
  const set = (key: string, patch: Partial<Service>) => setList(list.map(x => (x.key === key ? { ...x, ...patch } : x)));
  const toggle = (key: string, name: string) => setList(has(key) ? list.filter(x => x.key !== key) : [...list, { key, name, ...(SERVICE_DEFAULTS[key] ?? { price_cents: 0, per: "trip", note: "" }) }]);
  const custom = list.filter(x => !(x.key in SERVICE_PRESETS));
  const row = (x: Service, i?: number) => (
    <div key={x.key} className="svc-row">
      {i !== undefined && <input className="input" value={x.name} onChange={e => set(x.key, { name: e.target.value })} placeholder="Service name, e.g. Bike rental" aria-label={`Service name (extra ${i + 1})`} />}
      <label className="field" style={{ width: 130 }}><span>Price (USD)</span><input className="input mono" inputMode="decimal" defaultValue={dollars(x.price_cents)} onChange={e => set(x.key, { price_cents: cents(e.target.value) })} placeholder="Free" aria-label={`Price for ${x.name || "service"}`} /></label>
      <label className="field"><span>Charged</span><select className="input" value={x.per} onChange={e => set(x.key, { per: e.target.value })} aria-label={`How ${x.name || "service"} is charged`}>{Object.entries(SERVICE_PER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="field" style={{ flex: 1, minWidth: 180 }}><span>Note for guests (optional)</span><input className="input" value={x.note} maxLength={160} onChange={e => set(x.key, { note: e.target.value })} placeholder="Up to 4 people, book 24 hours ahead" aria-label={`Note for ${x.name || "service"}`} /></label>
      {i !== undefined && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setList(list.filter(y => y.key !== x.key))}>Remove</button>}
    </div>
  );
  return (
    <div className="stack" style={{ gap: 10 }}>
      <input type="hidden" name="services_json" value={JSON.stringify(list)} />
      {Object.entries(SERVICE_PRESETS).map(([key, name]) => (
        <div key={key} className="svc-preset">
          <label className="chk"><input type="checkbox" checked={has(key)} onChange={() => toggle(key, name)} />{name}</label>
          {has(key) && row(list.find(x => x.key === key)!)}
        </div>
      ))}
      <p className="hint">Leave the price empty to offer it for free. Guests who choose airport pickup or drop-off give you their flight and time when they book.</p>
      {custom.map((x, i) => row(x, i))}
      <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setList([...list, { key: `custom_${Date.now().toString(36)}`, name: "", price_cents: 0, per: "trip", note: "" }])}>+ Add your own service</button></div>
    </div>
  );
}

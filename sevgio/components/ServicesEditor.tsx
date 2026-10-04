"use client";
import { useState } from "react";
import { FIXED_SERVICE_NOTES, FREE_OR_CHARGE_SERVICES, PRESET_PRICED_SERVICES, SERVICE_DEFAULTS, SERVICE_PER, SERVICE_PRESETS, SERVICE_PRICE_PRESETS, type Service } from "@/lib/constants.ts";

const dollars = (c: number) => (c ? (c / 100).toFixed(2).replace(/\.00$/, "") : "");
const cents = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^0-9.]/g, "")) * 100) || 0);

/** Extras: tick a ready-made service or add your own, then set its price. Saved as JSON in a hidden field. */
export function ServicesEditor({ initial }: { initial: Service[] }) {
  const [list, setList] = useState<Service[]>(initial);
  // Services showing a typed amount: "Other amount" for rides and tours, "Charge" for early check-in and late check-out.
  const [typed, setTyped] = useState<Set<string>>(() => new Set(initial.filter(x => x.price_cents > 0 && !SERVICE_PRICE_PRESETS.includes(x.price_cents) || FREE_OR_CHARGE_SERVICES.includes(x.key) && x.price_cents > 0).map(x => x.key)));
  const setTypedFor = (key: string, on: boolean) => setTyped(prev => { const n = new Set(prev); if (on) n.add(key); else n.delete(key); return n; });
  const has = (key: string) => list.some(x => x.key === key);
  const set = (key: string, patch: Partial<Service>) => setList(list.map(x => (x.key === key ? { ...x, ...patch } : x)));
  const toggle = (key: string, name: string) => setList(has(key) ? list.filter(x => x.key !== key) : [...list, { key, name, ...(SERVICE_DEFAULTS[key] ?? { price_cents: 0, per: "trip", note: "" }) }]);
  const custom = list.filter(x => !(x.key in SERVICE_PRESETS));
  const amount = (x: Service, label: string) => (
    <label className="field" style={{ width: 130 }}><span>{label}</span><input className="input mono" inputMode="decimal" defaultValue={dollars(x.price_cents)} onChange={e => set(x.key, { price_cents: cents(e.target.value) })} placeholder={label === "Price (USD)" ? "Free" : "e.g. 25"} aria-label={`${label.replace(" (USD)", "")} for ${x.name || "service"}`} /></label>
  );
  const price = (x: Service) => {
    if (PRESET_PRICED_SERVICES.includes(x.key)) {
      const other = typed.has(x.key);
      return (
        <>
          <label className="field" style={{ width: 150 }}><span>Price</span>
            <select className="input" value={other ? "other" : String(x.price_cents)} aria-label={`Price for ${x.name}`}
              onChange={e => { const v = e.target.value; setTypedFor(x.key, v === "other"); if (v !== "other") set(x.key, { price_cents: Number(v) }); }}>
              <option value="0">Free</option>
              {SERVICE_PRICE_PRESETS.map(c => <option key={c} value={c}>${c / 100}</option>)}
              <option value="other">Other amount…</option>
            </select>
          </label>
          {other && amount(x, "Amount (USD)")}
        </>
      );
    }
    if (FREE_OR_CHARGE_SERVICES.includes(x.key)) {
      const charge = typed.has(x.key);
      return (
        <>
          <label className="field" style={{ width: 130 }}><span>Price</span>
            <select className="input" value={charge ? "charge" : "free"} aria-label={`Free or charge for ${x.name}`}
              onChange={e => { const on = e.target.value === "charge"; setTypedFor(x.key, on); if (!on) set(x.key, { price_cents: 0 }); }}>
              <option value="free">Free</option>
              <option value="charge">Charge</option>
            </select>
          </label>
          {charge && amount(x, "Fee (USD)")}
          {charge && !x.price_cents && <p className="hint svc-warn" role="status">Enter the fee, or choose Free.</p>}
        </>
      );
    }
    return amount(x, "Price (USD)");
  };
  const row = (x: Service, i?: number) => (
    <div key={x.key} className="svc-row">
      {i !== undefined && <input className="input" value={x.name} onChange={e => set(x.key, { name: e.target.value })} placeholder="Service name, e.g. Bike rental" aria-label={`Service name (extra ${i + 1})`} />}
      {price(x)}
      <label className="field"><span>Charged</span><select className="input" value={x.per} onChange={e => set(x.key, { per: e.target.value })} aria-label={`How ${x.name || "service"} is charged`}>{Object.entries(SERVICE_PER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {FIXED_SERVICE_NOTES[x.key]
        ? <div className="field svc-fixed-note" style={{ flex: 1, minWidth: 180 }}><span>Note for guests</span><p className="svc-note-fixed">{FIXED_SERVICE_NOTES[x.key]}</p></div>
        : <label className="field" style={{ flex: 1, minWidth: 180 }}><span>Note for guests (optional)</span><input className="input" value={x.note} maxLength={160} onChange={e => set(x.key, { note: e.target.value })} placeholder="Up to 4 people, book 24 hours ahead" aria-label={`Note for ${x.name || "service"}`} /></label>}
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
      <p className="hint">Pick a price or Free for each service; each listing keeps its own. Guests who choose airport pickup or drop-off give you their flight and time when they book.</p>
      {custom.map((x, i) => row(x, i))}
      <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setList([...list, { key: `custom_${Date.now().toString(36)}`, name: "", price_cents: 0, per: "trip", note: "" }])}>+ Add your own service</button></div>
    </div>
  );
}

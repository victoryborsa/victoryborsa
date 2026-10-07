"use client";
import { useEffect, useRef, useState } from "react";
import { RangePanel } from "./DatePicker.tsx";
import type { Place } from "./WherePicker.tsx";

const RECENT_KEY = "sevgio.recentSearches";
type Recent = Place & { ci?: string; co?: string; guests?: number };
type Seg = "" | "where" | "ci" | "co" | "who";
const show = (d: string) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
const Mag = () => <svg viewBox="0 0 24 24" aria-hidden className="ps-mag"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></svg>;

/**
 * The home page search, laid out as one rounded bar: Where | When | Who and a round search button.
 * Each part opens its own panel, and the bar moves on by itself: Where → check-in → check-out → Who.
 * On phones the panels slide up from the bottom.
 */
export function PillSearch({ places, today, labels }: { places: Place[]; today: string; labels: { where: string; when: string; who: string; search: string; anywhere: string } }) {
  const [open, setOpen] = useState<Seg>("");
  const [text, setText] = useState("");
  const [loc, setLoc] = useState("");
  const [ci, setCi] = useState("");
  const [co, setCo] = useState("");
  const [party, setParty] = useState({ adults: 0, children: 0, infants: 0, pets: 0 });
  const [recent, setRecent] = useState<Recent[]>([]);
  const box = useRef<HTMLFormElement>(null);
  const whereInput = useRef<HTMLInputElement>(null);

  useEffect(() => { try { setRecent((JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as Recent[]).slice(0, 3)); } catch { /* private window */ } }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen("");
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  useEffect(() => { if (open === "where") whereInput.current?.focus(); }, [open]);

  const q = text.trim().toLowerCase();
  const typing = !!q && q !== (places.find(p => p.value === loc)?.label ?? loc).toLowerCase();
  const matches = typing ? places.filter(p => (p.label + " " + p.sub).toLowerCase().includes(q)) : places;
  const pickPlace = (p: Place) => { setLoc(p.value); setText(p.value ? p.label : ""); setOpen("ci"); };
  const guests = party.adults + party.children;
  const whoText = guests ? `${guests} guest${guests === 1 ? "" : "s"}${party.infants ? `, ${party.infants} infant${party.infants === 1 ? "" : "s"}` : ""}${party.pets ? `, ${party.pets} pet${party.pets === 1 ? "" : "s"}` : ""}` : "";
  const step = (k: keyof typeof party, n: number) => setParty(p => {
    const next = { ...p, [k]: Math.max(0, Math.min(k === "pets" ? 5 : 16, p[k] + n)) };
    // Children, infants and pets come with at least one adult.
    if (n > 0 && k !== "adults" && next.adults === 0) next.adults = 1;
    if (k === "adults" && next.adults === 0 && (next.children || next.infants || next.pets)) next.adults = 1;
    return next;
  });
  const onSubmit = () => {
    const p = places.find(x => x.value === loc) ?? (loc ? { value: loc, label: loc, sub: "Your search", icon: "🔎" } : null);
    if (!p) return;
    const r: Recent = { ...p, ...(ci && co ? { ci, co } : {}), ...(guests ? { guests } : {}) };
    try { localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...recent.filter(x => x.value !== r.value)].slice(0, 3))); } catch { /* ignore */ }
  };
  const row = (k: keyof typeof party, name: string, hint: string) => (
    <div className="ps-who-row" key={k}>
      <span><b>{name}</b><small>{hint}</small></span>
      <span className="ps-step">
        <button type="button" aria-label={`Fewer ${name.toLowerCase()}`} disabled={party[k] === 0 || (k === "adults" && party.adults === 1 && (party.children + party.infants + party.pets) > 0)} onClick={() => step(k, -1)}>−</button>
        <output aria-label={name}>{party[k]}</output>
        <button type="button" aria-label={`More ${name.toLowerCase()}`} onClick={() => step(k, 1)}>+</button>
      </span>
    </div>
  );

  return (
    <form ref={box} className={`ps${open ? " active" : ""}`} action="/stays" method="get" role="search" onSubmit={onSubmit}>
      <input type="hidden" name="loc" value={loc} />
      {ci && co && <><input type="hidden" name="ci" value={ci} /><input type="hidden" name="co" value={co} /></>}
      {guests > 0 && <input type="hidden" name="guests" value={guests} />}
      {party.pets > 0 && <input type="hidden" name="amen" value="pets" />}

      <div className={`ps-seg ps-where${open === "where" ? " on" : ""}`} onClick={() => setOpen("where")}>
        <label htmlFor="ps-where">{labels.where}</label>
        <input id="ps-where" ref={whereInput} type="text" role="combobox" aria-expanded={open === "where"} aria-controls="ps-where-list" autoComplete="off"
          placeholder="Search destinations" value={text} onFocus={() => setOpen("where")}
          onChange={e => { setText(e.target.value); setLoc(e.target.value.trim()); setOpen("where"); }}
          onKeyDown={e => { if (e.key === "Enter" && open === "where" && matches[0] && typing) { e.preventDefault(); pickPlace(matches[0]); } }} />
      </div>
      <span className="ps-div" aria-hidden />
      <button type="button" className={`ps-seg ps-when${open === "ci" || open === "co" ? " on" : ""}`} aria-expanded={open === "ci" || open === "co"} onClick={() => setOpen(ci && !co ? "co" : "ci")}>
        <span className="ps-k">{labels.when}</span>
        <span className={ci ? "ps-v" : "ps-ph"}>{ci ? `${show(ci)}${co ? ` - ${show(co)}` : ""}` : "Add dates"}</span>
      </button>
      <span className="ps-div" aria-hidden />
      <div className={`ps-seg ps-who${open === "who" ? " on" : ""}`}>
        <button type="button" className="ps-who-btn" aria-expanded={open === "who"} onClick={() => setOpen("who")}>
          <span className="ps-k">{labels.who}</span>
          <span className={whoText ? "ps-v" : "ps-ph"}>{whoText || "Add guests"}</span>
        </button>
        <button type="submit" className={`ps-go${open ? " wide" : ""}`} aria-label={labels.search}><Mag /><span className="ps-go-txt">{labels.search}</span></button>
      </div>

      {open === "where" && (
        <div className="ps-pop ps-pop-where" id="ps-where-list" role="listbox" aria-label="Suggested destinations">
          {!typing && recent.length > 0 && <p className="ps-head">Recent searches</p>}
          {!typing && recent.map(r => (
            <button type="button" role="option" aria-selected={false} key={"r" + r.value} className="ps-opt" onClick={() => { pickPlace(r); if (r.ci && r.co) { setCi(r.ci); setCo(r.co); setOpen("who"); } }}>
              <span className="ps-ico" aria-hidden>🕘</span><span><b>{r.label}</b><small>{r.ci && r.co ? `${show(r.ci)} - ${show(r.co)}` : r.sub}{r.guests ? ` · ${r.guests} guest${r.guests === 1 ? "" : "s"}` : ""}</small></span>
            </button>
          ))}
          <p className="ps-head">Suggested destinations</p>
          {[{ value: "", label: labels.anywhere, sub: "Every stay we have", icon: "🧭" }, ...matches].map(p => (
            <button type="button" role="option" aria-selected={p.value === loc} key={p.value || "any"} className="ps-opt" onClick={() => pickPlace(p)}>
              <span className="ps-ico" aria-hidden>{p.icon}</span><span><b>{p.label}</b><small>{p.sub}</small></span>
            </button>
          ))}
        </div>
      )}
      {(open === "ci" || open === "co") && (
        <div className="ps-pop ps-pop-when" role="dialog" aria-label={open === "ci" ? "Choose check-in" : "Choose check-out"}>
          <RangePanel phase={open} value={{ ci, co }} rules={{ min: today }} today={today} labels={["Check-in", "Check-out"]} closeText={ci && co ? "Next" : "Skip"}
            onChange={(v, phase, done) => { setCi(v.ci); setCo(v.co); setOpen(done ? "who" : phase || "ci"); }} onClose={() => setOpen("who")} />
        </div>
      )}
      {open === "who" && (
        <div className="ps-pop ps-pop-who" role="dialog" aria-label="Who's coming">
          {row("adults", "Adults", "Ages 13 or above")}
          {row("children", "Children", "Ages 2-12")}
          {row("infants", "Infants", "Under 2")}
          {row("pets", "Pets", "Bringing a service animal? They're always welcome.")}
          <div className="ps-foot"><span className="spacer" /><button type="submit" className="btn btn-primary btn-sm">{labels.search}</button></div>
        </div>
      )}
    </form>
  );
}

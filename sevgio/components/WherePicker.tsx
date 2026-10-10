"use client";
import { useEffect, useId, useRef, useState } from "react";

export type Place = { value: string; label: string; sub: string; icon: string };
const RECENT_KEY = "sevgio.recentSearches";

/** The "Where" box: tap it and suggestions open (recent searches, Pittsburgh, Downtown, Indiana, neighborhoods). Type to filter. */
export function WherePicker({ name, label, initial, places, anywhere }: { name: string; label: string; initial: string; places: Place[]; anywhere: string }) {
  const [value, setValue] = useState(initial);
  const [text, setText] = useState(places.find(p => p.value === initial)?.label ?? initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<Place[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  useEffect(() => {
    try { setRecent((JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as Place[]).slice(0, 3)); } catch { /* private window */ }
  }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  // Remember what was searched, for "Recent searches" next time.
  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const save = () => {
      if (!value) return;
      const p = places.find(x => x.value === value) ?? { value, label: value, sub: "Your search", icon: "🔎" };
      try { localStorage.setItem(RECENT_KEY, JSON.stringify([p, ...recent.filter(r => r.value !== p.value)].slice(0, 3))); } catch { /* ignore */ }
    };
    form.addEventListener("submit", save);
    return () => form.removeEventListener("submit", save);
  }, [value, places, recent]);

  const q = text.trim().toLowerCase();
  const typing = q && q !== (places.find(p => p.value === value)?.label ?? value).toLowerCase();
  const matches = typing ? places.filter(p => (p.label + " " + p.sub).toLowerCase().includes(q)) : places;
  const options: Place[] = [{ value: "", label: anywhere, sub: "Every stay we have", icon: "🧭" }, ...matches];
  const pick = (p: Place) => {
    setValue(p.value); setText(p.value ? p.label : ""); setOpen(false); setActive(-1);
    // Lets the search form move on to the check-in date.
    box.current?.dispatchEvent(new CustomEvent("sevgio:where-picked", { bubbles: true }));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && active >= 0) { e.preventDefault(); pick(options[active]); }
    else if (e.key === "Escape") setOpen(false);
  };
  const row = (p: Place, i: number, key: string) => (
    <li key={key} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={`where-opt${i === active ? " on" : ""}`}
      onMouseDown={e => { e.preventDefault(); pick(p); }} onMouseEnter={() => setActive(i)}>
      <span className="where-ico" aria-hidden>{p.icon}</span>
      <span><b>{p.label}</b><small>{p.sub}</small></span>
    </li>
  );
  return (
    <div className="where" ref={box}>
      <label className="field">
        <span>{label}</span>
        <input className="input" type="text" value={text} placeholder="Search destinations" autoComplete="off" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={onKey}
          onChange={e => { setText(e.target.value); setValue(e.target.value.trim()); setOpen(true); setActive(-1); }} />
      </label>
      <input type="hidden" name={name} value={value} />
      {open && (
        <div className="where-panel">
          {!typing && recent.length > 0 && (
            <>
              <p className="where-head">Recent searches</p>
              <ul role="listbox" aria-label="Recent searches">{recent.map((p, i) => row({ ...p, icon: "🕘" }, 1000 + i, "r" + i))}</ul>
            </>
          )}
          <p className="where-head">{typing ? "Matching places" : "Suggested destinations"}</p>
          <ul id={listId} role="listbox" aria-label="Suggested destinations">
            {options.map((p, i) => row(p, i, p.value || "any"))}
            {typing && matches.length === 0 && <li className="where-none">Press Search to look for “{text.trim()}”</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

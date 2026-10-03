"use client";
import { useEffect, useState } from "react";

/** The guide's search bar: type a place, food or neighborhood (or pick a neighborhood) and only matching cards stay. */
export function GuideFilter({ areas, target }: { areas: string[]; target: string }) {
  const [text, setText] = useState("");
  const [area, setArea] = useState("");
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const root = document.getElementById(target);
    if (!root) return;
    const q = text.trim().toLowerCase();
    let shown = 0;
    root.querySelectorAll<HTMLElement>("[data-gsearch]").forEach(c => {
      const hay = c.dataset.gsearch || "";
      const ok = (!q || hay.includes(q)) && (!area || hay.includes(area.toLowerCase()));
      c.hidden = !ok;
      if (ok) shown++;
    });
    root.querySelectorAll<HTMLElement>(".ab-row").forEach(r => { r.hidden = !!(q || area) && !r.querySelector("[data-gsearch]:not([hidden])"); });
    setCount(q || area ? shown : null);
  }, [text, area, target]);
  return (
    <form className="ps gf" role="search" onSubmit={e => { e.preventDefault(); document.getElementById(target)?.scrollIntoView({ behavior: "smooth" }); }}>
      <div className="ps-seg">
        <label htmlFor="gf-what">What</label>
        <input id="gf-what" type="search" placeholder="Search places, food or things to do" value={text} onChange={e => setText(e.target.value)} />
      </div>
      <span className="ps-div" aria-hidden />
      <div className="ps-seg ps-who">
        <label className="gf-area"><span className="ps-k">Neighborhood</span>
          <select value={area} onChange={e => setArea(e.target.value)} aria-label="Neighborhood">
            <option value="">Anywhere in Pittsburgh</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <button type="submit" className={`ps-go${text || area ? " wide" : ""}`} aria-label="Search the guide">
          <svg viewBox="0 0 24 24" aria-hidden className="ps-mag"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></svg>
          <span className="ps-go-txt">{count === null ? "Search" : `${count} place${count === 1 ? "" : "s"}`}</span>
        </button>
      </div>
    </form>
  );
}

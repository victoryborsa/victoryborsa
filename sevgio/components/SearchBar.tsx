import { todayLocal, addDays } from "@/lib/dates.ts";

/** Plain GET form: works before any JavaScript loads, and results are shareable links. */
export function SearchBar({ loc = "", ci = "", co = "", guests = 2, cities = [], compact = false }: { loc?: string; ci?: string; co?: string; guests?: number; cities?: string[]; compact?: boolean }) {
  const today = todayLocal();
  return (
    <form className="searchbar" action="/stays" method="get" role="search" style={compact ? { marginTop: 0 } : undefined}>
      <label className="field">
        <span>Where</span>
        <input className="input" name="loc" list="city-list" placeholder="Town or area in Pennsylvania" defaultValue={loc} autoComplete="off" />
        <datalist id="city-list">{cities.map(c => <option key={c} value={c} />)}</datalist>
      </label>
      <label className="field">
        <span>Check-in</span>
        <input className="input" type="date" name="ci" min={today} defaultValue={ci} />
      </label>
      <label className="field">
        <span>Check-out</span>
        <input className="input" type="date" name="co" min={addDays(today, 1)} defaultValue={co} />
      </label>
      <label className="field">
        <span>Guests</span>
        <select className="input" name="guests" defaultValue={String(guests)}>
          {Array.from({ length: 16 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} guest{n > 1 ? "s" : ""}</option>)}
        </select>
      </label>
      <button className="btn btn-primary" type="submit">Search stays</button>
    </form>
  );
}

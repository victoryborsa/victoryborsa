import { todayLocal, addDays } from "@/lib/dates.ts";
import { getT } from "@/lib/i18n.ts";
import { publishedAreas } from "@/lib/queries.ts";

/** Plain GET form: works before any JavaScript loads, and results are shareable links. */
export async function SearchBar({ loc = "", ci = "", co = "", guests = 2, cities = [], compact = false }: { loc?: string; ci?: string; co?: string; guests?: number; cities?: string[]; compact?: boolean }) {
  const today = todayLocal();
  const [{ t }, areas] = await Promise.all([getT(), publishedAreas()]);
  const main = [["", t("search.anywhere")], ["Pittsburgh", t("search.pittsburgh")], ["Downtown Pittsburgh", "Downtown Pittsburgh"], ["Indiana", "Indiana, PA"]];
  const others = [...new Set([...areas, ...cities.filter(c => !["Pittsburgh", "Indiana"].includes(c))])].filter(a => !main.some(m => m[0] === a)).sort();
  const known = main.some(m => m[0] === loc) || others.includes(loc);
  return (
    <form className="searchbar" action="/stays" method="get" role="search" style={compact ? { marginTop: 0 } : undefined}>
      <label className="field">
        <span>{t("search.where")}</span>
        <select className="input" name="loc" defaultValue={loc}>
          {main.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          {others.length > 0 && <optgroup label={t("search.neighborhoods")}>{others.map(a => <option key={a} value={a}>{a}</option>)}</optgroup>}
          {loc && !known && <option value={loc}>{loc}</option>}
        </select>
      </label>
      <label className="field">
        <span>{t("search.checkin")}</span>
        <input className="input" type="date" name="ci" min={today} defaultValue={ci} />
      </label>
      <label className="field">
        <span>{t("search.checkout")}</span>
        <input className="input" type="date" name="co" min={addDays(today, 1)} defaultValue={co} />
      </label>
      <label className="field">
        <span>{t("search.guests")}</span>
        <select className="input" name="guests" defaultValue={String(Math.min(guests, 10))}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? t("search.guest1") : t("search.guestN", { n })}</option>)}
        </select>
      </label>
      <button className="btn btn-primary" type="submit">{t("search.submit")}</button>
    </form>
  );
}

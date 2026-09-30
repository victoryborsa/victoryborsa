import { todayLocal, addDays } from "@/lib/dates.ts";
import { getT } from "@/lib/i18n.ts";

/** Plain GET form: works before any JavaScript loads, and results are shareable links. */
export async function SearchBar({ loc = "", ci = "", co = "", guests = 2, cities = [], compact = false }: { loc?: string; ci?: string; co?: string; guests?: number; cities?: string[]; compact?: boolean }) {
  const today = todayLocal();
  const { t } = await getT();
  return (
    <form className="searchbar" action="/stays" method="get" role="search" style={compact ? { marginTop: 0 } : undefined}>
      <label className="field">
        <span>{t("search.where")}</span>
        <input className="input" name="loc" list="city-list" placeholder={t("search.wherePh")} defaultValue={loc} autoComplete="off" />
        <datalist id="city-list">{cities.map(c => <option key={c} value={c} />)}</datalist>
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
        <select className="input" name="guests" defaultValue={String(guests)}>
          {Array.from({ length: 16 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? t("search.guest1") : t("search.guestN", { n })}</option>)}
        </select>
      </label>
      <button className="btn btn-primary" type="submit">{t("search.submit")}</button>
    </form>
  );
}

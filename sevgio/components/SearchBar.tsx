import { todayLocal } from "@/lib/dates.ts";
import { getT } from "@/lib/i18n.ts";
import { q } from "@/lib/db.ts";
import { WherePicker, type Place } from "./WherePicker.tsx";
import { AutoAdvance } from "./AutoAdvance.tsx";
import { DateRangeField } from "./DateRangeField.tsx";

/** The places offered under "Where": Pittsburgh, Downtown, Indiana, then every neighborhood and town with a stay. */
export async function searchPlaces(): Promise<Place[]> {
  const rows = await q<{ city: string; area: string; n: number }>("SELECT city, area, count(*)::int AS n FROM properties WHERE status = 'published' GROUP BY city, area ORDER BY city, area");
  const inCity = (c: string) => rows.filter(r => r.city.toLowerCase() === c).reduce((n, r) => n + r.n, 0);
  const count = (n: number) => (n ? ` · ${n} stay${n === 1 ? "" : "s"}` : "");
  const places: Place[] = [
    { value: "Pittsburgh", label: "Pittsburgh, PA", sub: `For sights like Acrisure Stadium and PNC Park${count(inCity("pittsburgh"))}`, icon: "🌉" },
    { value: "Downtown Pittsburgh", label: "Downtown Pittsburgh", sub: "Close to the stadiums, Point State Park and the Cultural District", icon: "🏙️" },
    { value: "Indiana", label: "Indiana, PA", sub: `Near IUP and Indiana Regional Medical Center${count(inCity("indiana"))}`, icon: "🎓" },
  ];
  const seen = new Set(places.map(p => p.value.toLowerCase()));
  for (const r of rows) {
    for (const [value, sub] of [[r.area, `Neighborhood in ${r.city}`], [r.city, "Town in Pennsylvania"]] as const) {
      if (!value || seen.has(value.toLowerCase())) continue;
      seen.add(value.toLowerCase());
      const n = rows.filter(x => x.area === value || x.city === value).reduce((k, x) => k + x.n, 0);
      places.push({ value, label: value, sub: sub + count(n), icon: sub.startsWith("Neighborhood") ? "🏘️" : "📍" });
    }
  }
  return places;
}

/** GET form, so results are shareable links. "Where" opens a list of suggested places as soon as it's tapped. */
export async function SearchBar({ loc = "", ci = "", co = "", guests = 2, compact = false }: { loc?: string; ci?: string; co?: string; guests?: number; cities?: string[]; compact?: boolean }) {
  const today = todayLocal();
  const [{ t }, places] = await Promise.all([getT(), searchPlaces()]);
  return (
    <form className="searchbar" action="/stays" method="get" role="search" style={compact ? { marginTop: 0 } : undefined}>
      <AutoAdvance />
      <WherePicker name="loc" label={t("search.where")} initial={loc} places={places} anywhere={t("search.anywhere")} />
      <DateRangeField today={today} initialCi={ci} initialCo={co} ciLabel={t("search.checkin")} coLabel={t("search.checkout")} />
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

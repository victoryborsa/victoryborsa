import Link from "next/link";
import type { Metadata } from "next";
import { searchProperties, publishedCities } from "@/lib/queries.ts";
import { getSettings } from "@/lib/settings.ts";
import { isIsoDate, fmtShort, todayLocal } from "@/lib/dates.ts";
import { AMENITY_FILTERS } from "@/lib/constants.ts";
import { PropertyCard } from "@/components/PropertyCard.tsx";
import { SearchBar } from "@/components/SearchBar.tsx";
import { FilterToggle } from "@/components/FilterToggle.tsx";
import { AutoSubmit } from "@/components/AutoSubmit.tsx";

export const metadata: Metadata = { title: "Find a stay" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
const num = (v: string | string[] | undefined) => { const n = parseInt(first(v), 10); return Number.isFinite(n) && n > 0 ? n : 0; };

export default async function Stays({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const loc = first(sp.loc).slice(0, 80);
  let ci = first(sp.ci), co = first(sp.co);
  let dateError = "";
  const today = todayLocal();
  if (ci || co) {
    if (!isIsoDate(ci) || !isIsoDate(co)) dateError = "Add both a check-in and a check-out date to see what's free.";
    else if (ci < today) dateError = "Check-in can't be in the past.";
    else if (co <= ci) dateError = "Check-out must be after check-in.";
    if (dateError) { ci = ""; co = ""; }
  }
  const guests = Math.min(num(sp.guests) || 1, 50);
  const amen = (Array.isArray(sp.amen) ? sp.amen : sp.amen ? [sp.amen] : []).filter(a => a in AMENITY_FILTERS);
  const f = { loc, ci, co, guests, maxPrice: num(sp.max), bedrooms: num(sp.beds), baths: num(sp.baths), amenities: amen, instant: first(sp.instant) === "1", privateBath: first(sp.pbath) === "1", sort: first(sp.sort) };
  const [list, cities, settings] = await Promise.all([searchProperties(f), publishedCities(), getSettings()]);
  const filtersOn = !!(f.maxPrice || f.bedrooms || f.baths || amen.length || f.instant || f.privateBath);
  const clearHref = "/stays?" + new URLSearchParams({ ...(loc && { loc }), ...(ci && { ci, co }), guests: String(guests) });

  return (
    <div className="wrap" style={{ paddingTop: 22 }}>
      <SearchBar loc={loc} ci={ci} co={co} guests={guests} cities={cities} compact />
      <div className="results-layout">
        <FilterToggle active={(f.maxPrice ? 1 : 0) + (f.bedrooms ? 1 : 0) + (f.baths ? 1 : 0) + amen.length + (f.instant ? 1 : 0) + (f.privateBath ? 1 : 0)}>
        <form className="filters" action="/stays" method="get" aria-label="Filters">
          <AutoSubmit />
          <input type="hidden" name="loc" value={loc} />
          {ci && <><input type="hidden" name="ci" value={ci} /><input type="hidden" name="co" value={co} /></>}
          <input type="hidden" name="guests" value={guests} />
          <input type="hidden" name="sort" value={f.sort} />
          <div className="row"><h3>Filters</h3><span className="spacer" />{filtersOn && <Link href={clearHref}>Clear all</Link>}</div>
          <label className="field">
            <span>Max price per night</span>
            <select className="input" name="max" defaultValue={String(f.maxPrice || "")}>
              <option value="">Any price</option>
              {[100, 150, 200, 250, 300, 400, 500].map(v => <option key={v} value={v}>Up to ${v}</option>)}
            </select>
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Bedrooms</span>
              <select className="input" name="beds" defaultValue={String(f.bedrooms || "")}>
                <option value="">Any</option>{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}+</option>)}
              </select>
            </label>
            <label className="field">
              <span>Bathrooms</span>
              <select className="input" name="baths" defaultValue={String(f.baths || "")}>
                <option value="">Any</option>{[1, 2, 3].map(v => <option key={v} value={v}>{v}+</option>)}
              </select>
            </label>
          </div>
          <label className="chk"><input type="checkbox" name="pbath" value="1" defaultChecked={f.privateBath} />Private bathroom only</label>
          <fieldset>
            <legend>Amenities</legend>
            {Object.entries(AMENITY_FILTERS).map(([a, f]) => (
              <label className="chk" key={a}><input type="checkbox" name="amen" value={a} defaultChecked={amen.includes(a)} />{f.label}</label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Booking</legend>
            <label className="chk"><input type="checkbox" name="instant" value="1" defaultChecked={f.instant} />Instant booking only</label>
          </fieldset>
          <noscript><button className="btn btn-primary" type="submit">Apply filters</button></noscript>
        </form>
        </FilterToggle>

        <div style={{ minWidth: 0 }}>
          <div className="results-head">
            <div>
              <h2>{list.length} {list.length === 1 ? "stay" : "stays"}{loc ? ` matching “${loc}”` : " in Pennsylvania"}</h2>
              <p className="muted">{ci ? `${fmtShort(ci)} – ${fmtShort(co)}` : "Any dates"} · {guests} guest{guests > 1 ? "s" : ""}</p>
            </div>
            <span className="spacer" />
            <form action="/stays" method="get" className="row" style={{ gap: 8 }}>
              <AutoSubmit />
              {Object.entries(sp).filter(([k]) => k !== "sort").flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x, i) => <input key={k + i} type="hidden" name={k} value={x || ""} />))}
              <label htmlFor="sort" className="muted" style={{ fontSize: 14 }}>Sort by</label>
              <select className="input" id="sort" name="sort" defaultValue={f.sort || "recommended"} style={{ width: "auto", minHeight: 40 }}>
                <option value="recommended">Recommended</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="rating">Guest rating</option>
                <option value="guests">Most guests</option>
              </select>
              <noscript><button className="btn btn-ghost btn-sm" type="submit">Sort</button></noscript>
            </form>
          </div>
          {dateError && <div className="notice warn" style={{ marginBottom: 18 }} role="alert">{dateError}</div>}
          {!ci && !dateError && <div className="notice info" style={{ marginBottom: 18 }}>Add your dates to see only homes that are free, with the total price for your stay.</div>}
          {list.length ? (
            <div className="cards">{list.map((p, i) => <PropertyCard key={p.id} p={p} ci={ci} co={co} guests={guests} taxPercent={settings.tax_percent} eager={i < 3} />)}</div>
          ) : (
            <div className="empty">
              <h3>No stays match your search</h3>
              <p className="muted" style={{ maxWidth: "46ch" }}>
                {ci ? `Every home that fits is booked for ${fmtShort(ci)} – ${fmtShort(co)}, or needs a different length of stay. ` : ""}
                Try different dates, fewer filters, or a nearby town.
              </p>
              <div className="row" style={{ justifyContent: "center" }}>
                {filtersOn && <Link className="btn btn-ghost" href={clearHref}>Clear filters</Link>}
                {ci && <Link className="btn btn-ghost" href={"/stays?" + new URLSearchParams({ ...(loc && { loc }), guests: String(guests) })}>Remove dates</Link>}
                <Link className="btn btn-ghost" href="/contact">Ask us for help</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

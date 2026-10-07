import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon.tsx";
import type { Metadata } from "next";
import { searchProperties, publishedCities } from "@/lib/queries.ts";
import { getSettings } from "@/lib/settings.ts";
import { isIsoDate, fmtShort, todayLocal } from "@/lib/dates.ts";
import { AMENITY_FILTERS, placeLabel } from "@/lib/constants.ts";
import { PropertyCard } from "@/components/PropertyCard.tsx";
import { demandBetween, manualPrices } from "@/lib/demand.ts";
import { SearchBar } from "@/components/SearchBar.tsx";
import { FilterDrawer } from "@/components/FilterDrawer.tsx";
import { MapToggle } from "@/components/MapToggle.tsx";
import { StaysMap, type MapPin } from "@/components/StaysMap.tsx";
import { approxPosition } from "@/lib/map-pins.ts";
import { priceTag } from "@/lib/pricing.ts";
import { money } from "@/lib/money.ts";
import { photoUrl } from "@/lib/queries.ts";
import { AutoSubmit } from "@/components/AutoSubmit.tsx";
import { pageMeta } from "@/lib/seo.tsx";

export const metadata: Metadata = pageMeta("/stays", "Find a furnished stay in Pittsburgh", "Search furnished rooms, apartments and houses in Pittsburgh by dates, price, bedrooms, private bathroom and length of stay. Nightly and monthly rates, booked direct.");
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
  const kind: "" | "home" | "room" = first(sp.kind) === "home" || first(sp.kind) === "room" ? (first(sp.kind) as "home" | "room") : "";
  const f = { loc, ci, co, guests, maxPrice: num(sp.max), bedrooms: num(sp.beds), baths: num(sp.baths), amenities: amen, instant: first(sp.instant) === "1", privateBath: first(sp.pbath) === "1", sort: first(sp.sort),
    monthly: first(sp.monthly) === "1", freeCancel: first(sp.cancel) === "1", kind };
  const [list, cities, settings] = await Promise.all([searchProperties(f), publishedCities(), getSettings()]);
  const demand = ci && list.some(p => p.smart_pricing) ? await demandBetween(ci, co) : undefined;
  const prices = ci && co ? await manualPrices(list.map(p => p.id), ci, co) : {};
  const activeCount = (f.maxPrice ? 1 : 0) + (f.bedrooms ? 1 : 0) + (f.baths ? 1 : 0) + amen.length + (f.instant ? 1 : 0) + (f.privateBath ? 1 : 0) + (f.monthly ? 1 : 0) + (f.freeCancel ? 1 : 0) + (kind ? 1 : 0);
  const filtersOn = activeCount > 0;
  const clearHref = "/stays?" + new URLSearchParams({ ...(loc && { loc }), ...(ci && { ci, co }), guests: String(guests) });
  // Quick filter buttons: each one is a link that switches that filter on or off.
  const params = () => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : [v]) if (x) u.append(k, x); return u; };
  const toggle = (key: string, value: string) => {
    const u = params();
    if (u.getAll(key).includes(value)) { const rest = u.getAll(key).filter(x => x !== value); u.delete(key); rest.forEach(x => u.append(key, x)); } else if (key === "amen") u.append(key, value); else u.set(key, value);
    return "/stays?" + u.toString();
  };
  const chips: [string, string, string, IconName][] = [
    ["kind", "home", "Entire home", "home"], ["kind", "room", "Private room", "room"], ["amen", "pets", "Allows pets", "pets"], ["amen", "selfcheckin", "Self check-in", "key"],
    ["amen", "parking", "Free parking", "car"], ["cancel", "1", "Free cancellation", "check"], ["amen", "wifi", "Wifi", "wifi"], ["amen", "kitchen", "Kitchen", "kitchen"],
    ["amen", "washer", "Washer", "washer"], ["amen", "ac", "Air conditioning", "ac"], ["amen", "workspace", "Workspace", "laptop"], ["amen", "hottub", "Hot tub", "bath"],
    ["amen", "fireplace", "Fireplace", "fire"], ["instant", "1", "Instant book", "bolt"], ["pbath", "1", "Private bathroom", "shower"], ["monthly", "1", "Monthly stays", "calendar"],
  ];
  const pins: MapPin[] = list.flatMap(p => {
    const pos = approxPosition(p);
    if (!pos) return [];
    const tag = priceTag(p);
    const qs = ci ? `?ci=${ci}&co=${co}&guests=${guests}` : "";
    return [{ id: p.id, lat: pos[0], lng: pos[1], price: `${money(tag.cents)}${tag.unit === "month" ? "/mo" : ""}`, title: p.title, sub: placeLabel(p.city, p.area), href: `/stays/${p.slug}${qs}`, img: p.cover_id ? photoUrl(p.cover_id, "thumb") : null }];
  });

  return (
    <div className="wrap wrap-wide theme-light" style={{ paddingTop: 22 }}>
      <SearchBar loc={loc} ci={ci} co={co} guests={guests} cities={cities} compact />
      <nav className="chips-row" aria-label="Quick filters">
        <FilterDrawer active={activeCount}>
        <form className="filters" action="/stays" method="get" aria-label="Filters">
          <input type="hidden" name="loc" value={loc} />
          {ci && <><input type="hidden" name="ci" value={ci} /><input type="hidden" name="co" value={co} /></>}
          <input type="hidden" name="guests" value={guests} />
          <input type="hidden" name="sort" value={f.sort} />
          <fieldset>
            <legend>Type of place</legend>
            <div className="seg">
              {([["", "Any type"], ["home", "Entire home"], ["room", "Private room"]] as const).map(([v, l]) => <label key={v} className="seg-opt"><input type="radio" name="kind" value={v} defaultChecked={kind === v} /><span>{l}</span></label>)}
            </div>
          </fieldset>
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
          <fieldset className="two-col">
            <legend>Amenities</legend>
            {Object.entries(AMENITY_FILTERS).map(([a, f]) => (
              <label className="chk" key={a}><input type="checkbox" name="amen" value={a} defaultChecked={amen.includes(a)} />{f.label}</label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Booking</legend>
            <label className="chk"><input type="checkbox" name="instant" value="1" defaultChecked={f.instant} />Instant booking only</label>
            <label className="chk"><input type="checkbox" name="cancel" value="1" defaultChecked={f.freeCancel} />Free cancellation</label>
            <label className="chk"><input type="checkbox" name="monthly" value="1" defaultChecked={f.monthly} />Monthly stays (1 month or more)</label>
          </fieldset>
          <div className="drawer-foot">
            {filtersOn ? <Link className="btn btn-ghost" href={clearHref}>Clear all</Link> : <span />}
            <button className="btn btn-primary" type="submit">Show stays</button>
          </div>
        </form>
        </FilterDrawer>
        {chips.map(([k, v, label, icon]) => {
          const on = params().getAll(k).includes(v);
          return <Link key={k + v} href={toggle(k, v)} className={`chip${on ? " on" : ""}`} aria-pressed={on} scroll={false}><Icon name={icon} />{label}</Link>;
        })}
      </nav>
      <div className="results-split">
        <section className="results-list" aria-label="Stays">
          <div className="results-head">
            <div>
              <h1 className="h-like-2">{list.length} {list.length === 1 ? "stay" : "stays"}{loc ? ` in ${loc}` : ""}</h1>
              <p className="muted">{ci ? `${fmtShort(ci)} - ${fmtShort(co)}` : "Any dates"} · {guests} guest{guests > 1 ? "s" : ""}</p>
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
            <div className="cards results-cards">{list.map((p, i) => <PropertyCard key={p.id} p={p} demand={demand} prices={prices[p.id]} ci={ci} co={co} guests={guests} taxPercent={settings.tax_percent} eager={i < 3} />)}</div>
          ) : (
            <div className="empty">
              <h3>No stays match your search</h3>
              <p className="muted" style={{ maxWidth: "46ch" }}>
                {ci ? `Every home that fits is booked for ${fmtShort(ci)} - ${fmtShort(co)}, or needs a different length of stay. ` : ""}
                Try different dates, fewer filters, or a nearby town.
              </p>
              <div className="row" style={{ justifyContent: "center" }}>
                {filtersOn && <Link className="btn btn-ghost" href={clearHref}>Clear filters</Link>}
                {ci && <Link className="btn btn-ghost" href={"/stays?" + new URLSearchParams({ ...(loc && { loc }), guests: String(guests) })}>Remove dates</Link>}
                <Link className="btn btn-ghost" href="/contact">Ask us for help</Link>
              </div>
            </div>
          )}
        </section>
        <aside className="results-map" aria-label="Map">
          <StaysMap pins={pins} />
          {list.length > pins.length && <p className="map-note">{list.length - pins.length} stay{list.length - pins.length === 1 ? " isn't" : "s aren't"} on the map yet.</p>}
        </aside>
      </div>
      <MapToggle />
    </div>
  );
}

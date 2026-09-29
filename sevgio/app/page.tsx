import Link from "next/link";
import { featuredProperties, photoUrl, publishedCities } from "@/lib/queries.ts";
import { getSettings } from "@/lib/settings.ts";
import { PropertyCard } from "@/components/PropertyCard.tsx";
import { SearchBar } from "@/components/SearchBar.tsx";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [props, cities, settings] = await Promise.all([featuredProperties(6), publishedCities(), getSettings()]);
  const hero = props.find(p => p.cover_id);
  return (
    <div className="wrap">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">Book direct with Sevgio</p>
            <h1 style={{ marginTop: 10 }}>Homes worth coming back to, from the Poconos to Pittsburgh.</h1>
            <p className="lede">Lake houses, city lofts, farm stays and mountain cabins across Pennsylvania. See real-time availability and the full price before you book.</p>
          </div>
          <div className="hero-art">
            {hero?.cover_id ? <img src={photoUrl(hero.cover_id)} alt={hero.title} fetchPriority="high" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div className="noph">Sevgio stays</div>}
          </div>
        </div>
        <SearchBar cities={cities} />
      </section>

      <section className="block">
        <div className="section-head">
          <div>
            <h2>Available stays</h2>
            <p className="muted" style={{ marginTop: 4 }}>Hand-picked homes with instant booking or quick host replies.</p>
          </div>
          <span className="spacer" />
          <Link className="btn btn-ghost" href="/stays">View all properties</Link>
        </div>
        {props.length ? (
          <div className="cards">{props.map((p, i) => <PropertyCard key={p.id} p={p} taxPercent={settings.tax_percent} eager={i < 3} />)}</div>
        ) : (
          <div className="empty"><h3>New homes are on the way</h3><p className="muted">Check back soon, or contact us and we'll help you find a stay.</p></div>
        )}
      </section>

      <section className="block" style={{ paddingBottom: 56 }}>
        <div className="box" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 20 }}>
          <div className="stack" style={{ flex: 1, minWidth: 240 }}>
            <h3>Questions before you book?</h3>
            <p className="muted">We answer within a few hours, every day of the week. Ask about parking, early check-in, cribs or anything else.</p>
          </div>
          <Link className="btn btn-primary" href="/contact">Contact us</Link>
        </div>
      </section>
    </div>
  );
}

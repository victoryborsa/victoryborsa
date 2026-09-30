import Link from "next/link";
import { allPublished, publishedCities } from "@/lib/queries.ts";
import { getSettings } from "@/lib/settings.ts";
import { PropertyCard } from "@/components/PropertyCard.tsx";
import { SearchBar } from "@/components/SearchBar.tsx";
import { WorldMap } from "@/components/WorldMap.tsx";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [props, cities, settings] = await Promise.all([allPublished(), publishedCities(), getSettings()]);
  return (
    <div className="wrap">
      <section className="hero hero-welcome">
        <p className="eyebrow">Welcome, yinz!</p>
        <h1 style={{ marginTop: 10 }}>From anywhere in the world to a home in Pittsburgh.</h1>
        <p className="lede">Whether yinz are flying in from Istanbul, London or Tokyo, or just coming up the Parkway, we have cozy private rooms and whole houses waiting for you. Book direct with your hosts, see real-time availability and the full price before you book.</p>
        <p className="hello" aria-label="Welcome in many languages">
          {["Welcome", "Hoş geldiniz", "Bienvenidos", "Bienvenue", "Willkommen", "Benvenuti", "Bem-vindos", "ようこそ", "欢迎", "स्वागत है", "Yinz are welcome!"].map(w => <span key={w} lang={w === "Hoş geldiniz" ? "tr" : undefined}>{w}</span>)}
        </p>
        <div className="worldmap-wrap"><WorldMap /></div>
        <SearchBar cities={cities} />
      </section>

      <section className="block">
        <div className="section-head">
          <div>
            <h2>All our stays</h2>
            <p className="muted" style={{ marginTop: 4 }}>{props.length} place{props.length === 1 ? "" : "s"} to stay in Pittsburgh, n'at. Rent a whole house, or a private room in one.</p>
          </div>
          <span className="spacer" />
          <Link className="btn btn-ghost" href="/stays">Search by dates</Link>
        </div>
        {props.length ? (
          <div className="cards">{props.map((p, i) => <PropertyCard key={p.id} p={p} taxPercent={settings.tax_percent} eager={i < 4} />)}</div>
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

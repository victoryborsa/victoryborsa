import Link from "next/link";
import { allPublished, publishedCities } from "@/lib/queries.ts";
import { getSettings } from "@/lib/settings.ts";
import { PropertyCard } from "@/components/PropertyCard.tsx";
import { SearchBar } from "@/components/SearchBar.tsx";
import { WorldMap } from "@/components/WorldMap.tsx";
import { Slideshow } from "@/components/Slideshow.tsx";
import { Logo } from "@/components/Logo.tsx";
import { q } from "@/lib/db.ts";
import { getT, LANGS } from "@/lib/i18n.ts";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [{ lang, t }, props, cities, settings, slides] = await Promise.all([getT(), allPublished(), publishedCities(), getSettings(), q<{ id: string; caption: string }>("SELECT id, caption FROM site_photos WHERE slot IS NULL ORDER BY position, created_at LIMIT 20")]);
  return (
    <div className="wrap">
      <section className="hero hero-welcome">
        <div className="hero-grid">
          <div>
        <div className="row" style={{ gap: 18, alignItems: "center", flexWrap: "nowrap" }}>
          <div className="hero-logo"><Logo size={120} /></div>
          <p className="eyebrow">{t("home.eyebrow")}</p>
        </div>
        <h1 style={{ marginTop: 10 }}>{t("home.h1")}</h1>
        <p className="lede">{t("home.lede")}</p>
        <nav className="hello" aria-label={t("home.pickLang")}>
          {[...LANGS.slice(1), LANGS[0]].map(l => (
            <a key={l.code} href={`/lang/${l.code}?next=/`} lang={l.code} hrefLang={l.code} className={l.code === lang ? "on" : undefined} aria-current={l.code === lang ? "true" : undefined} title={l.name}>{l.hello}</a>
          ))}
        </nav>
        <p className="hint" style={{ marginTop: 6 }}>{t("home.pickLang")}</p>
          </div>
          <Slideshow photos={slides.map(s => ({ src: `/api/site-photos/${s.id}`, caption: s.caption }))} />
        </div>
        <div className="worldmap-wrap"><WorldMap /></div>
        <SearchBar cities={cities} />
      </section>

      <section className="block">
        <div className="section-head">
          <div>
            <h2>{t("home.allStays")}</h2>
            <p className="muted" style={{ marginTop: 4 }}>{t("home.count", { n: props.length })}</p>
          </div>
          <span className="spacer" />
          <Link className="btn btn-ghost" href="/stays">{t("home.searchDates")}</Link>
        </div>
        {props.length ? (
          <div className="cards home-cards">{props.map((p, i) => <PropertyCard key={p.id} p={p} taxPercent={settings.tax_percent} eager={i < 4} />)}</div>
        ) : (
          <div className="empty"><h3>New homes are on the way</h3><p className="muted">Check back soon, or contact us and we'll help you find a stay.</p></div>
        )}
      </section>

      <section className="block">
        <div className="guide-promo">
          <div className="stack" style={{ flex: 1, minWidth: 240 }}>
            <h3>{t("home.guideTitle")}</h3>
            <p>{t("home.guideText")}</p>
          </div>
          <Link className="btn" href="/pittsburgh">{t("home.guideBtn")} →</Link>
        </div>
      </section>

      <section className="block" style={{ paddingBottom: 56 }}>
        <div className="box" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 20 }}>
          <div className="stack" style={{ flex: 1, minWidth: 240 }}>
            <h3>{t("home.questions")}</h3>
            <p className="muted">{t("home.questionsText")}</p>
          </div>
          <Link className="btn btn-primary" href="/contact">{t("home.contactUs")}</Link>
        </div>
      </section>
    </div>
  );
}

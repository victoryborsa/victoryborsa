import type { Metadata } from "next";
import Link from "next/link";
import { q } from "@/lib/db.ts";
import { NEAR, SECTIONS, YINZER, mapLink, slugOf, type Section } from "@/lib/guide.ts";
import { getT } from "@/lib/i18n.ts";
import type { T } from "@/lib/i18n.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pittsburgh guide: what to eat, see and do",
  description: "A local's guide to Pittsburgh: famous food, bars and breweries, historic neighborhoods, museums, game days and Yinzer words.",
};

function Grid({ section, photos, t }: { section: Section; photos: Map<string, string>; t: T }) {
  return (
    <div className="guide-grid">
      {section.places.map(p => {
        const photo = photos.get(slugOf(p.name));
        return (
          <article key={p.name} className="guide-card">
            <div className="guide-pic" style={{ "--tone": section.tone } as React.CSSProperties}>
              {photo ? <img src={`/api/site-photos/${photo}`} alt={p.name} loading="lazy" /> : <span className="guide-icon" role="img" aria-label={p.name}>{p.icon}</span>}
            </div>
            <div className="guide-body">
              <p className="guide-area">{p.area}</p>
              <h3>{p.name}</h3>
              <p className="muted guide-text">{p.text}</p>
              <a href={mapLink(p)} target="_blank" rel="noopener noreferrer" className="guide-map">{t("guide.map")} ↗</a>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default async function PittsburghGuide() {
  const { lang, t } = await getT();
  const rows = await q<{ id: string; slot: string }>("SELECT id, slot FROM site_photos WHERE slot IS NOT NULL");
  const photos = new Map(rows.map(r => [r.slot, r.id]));
  const sec = (id: Section["id"]) => SECTIONS.find(s => s.id === id)!;
  return (
    <div className="wrap guide" style={{ paddingBottom: 56 }}>
      <section className="guide-hero">
        <p className="eyebrow">{t("guide.eyebrow")}</p>
        <h1>{t("guide.title")}</h1>
        <p className="lede">{t("guide.intro")}</p>
        {lang !== "en" && <p className="hint">{t("guide.englishNote")}</p>}
        <nav className="guide-toc" aria-label="Guide sections">
          {([["see", t("guide.see")], ["museums", t("guide.museums")], ["eat", t("guide.eat")], ["drink", t("guide.drink")], ["do", t("guide.do")], ["near", t("guide.near")], ["yinzer", t("guide.yinzer")], ["tips", t("guide.tips")]] as const).map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>
      </section>

      <section id="see" className="block"><h2>{t("guide.see")}</h2><Grid section={sec("see")} photos={photos} t={t} /></section>
      <section id="museums" className="block"><h2>{t("guide.museums")}</h2><Grid section={sec("museums")} photos={photos} t={t} /></section>
      <section id="eat" className="block"><h2>{t("guide.eat")}</h2><p className="muted">{t("guide.eatIntro")}</p><Grid section={sec("eat")} photos={photos} t={t} /></section>
      <section id="drink" className="block"><h2>{t("guide.drink")}</h2><Grid section={sec("drink")} photos={photos} t={t} /></section>
      <section id="do" className="block"><h2>{t("guide.do")}</h2><Grid section={sec("do")} photos={photos} t={t} /></section>

      <section id="near" className="block">
        <h2>{t("guide.near")}</h2>
        <div className="guide-grid">
          {NEAR.map(n => (
            <article key={n.home} className="guide-card">
              <p className="guide-area">{n.area}</p>
              <h3>{n.home}</h3>
              <p className="muted">{n.items}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="yinzer" className="block">
        <h2>{t("guide.yinzer")}</h2>
        <p className="muted">{t("guide.yinzerIntro")}</p>
        <dl className="yinzer">
          {YINZER.map(([w, m]) => <div key={w}><dt>{w}</dt><dd>{m}</dd></div>)}
        </dl>
      </section>

      <section id="tips" className="block">
        <h2>{t("guide.tips")}</h2>
        <ul className="rules">
          {(["guide.tip1", "guide.tip2", "guide.tip3", "guide.tip4", "guide.tip5"] as const).map(k => <li key={k}>{t(k)}</li>)}
        </ul>
        <div className="box" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16, marginTop: 20 }}>
          <div className="stack" style={{ flex: 1, minWidth: 240 }}><h3>{t("guide.ready")}</h3><p className="muted">{t("guide.readyText")}</p></div>
          <Link className="btn btn-primary" href="/stays">{t("guide.cta")}</Link>
        </div>
      </section>
    </div>
  );
}

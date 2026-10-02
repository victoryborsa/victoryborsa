import type { Metadata } from "next";
import Link from "next/link";
import { q } from "@/lib/db.ts";
import { PictureTrio } from "@/components/PictureTrio.tsx";
import { GuideNav } from "@/components/GuideNav.tsx";
import { NEAR, SECTIONS, YINZER, mapLink, slugOf, type Section } from "@/lib/guide.ts";
import { getT } from "@/lib/i18n.ts";
import type { T } from "@/lib/i18n.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pittsburgh guide: what to eat, see and do",
  description: "A local's guide to Pittsburgh: famous food, bars and breweries, historic neighborhoods, museums, game days and Yinzer words.",
};

// Every category, in page order, with the icon shown on its chip and header.
const CATS = [
  { id: "yinzer", icon: "🗣️" }, { id: "see", icon: "🏛️" }, { id: "museums", icon: "🎨" }, { id: "eat", icon: "🍽️" },
  { id: "drink", icon: "🍺" }, { id: "do", icon: "🎟️" }, { id: "near", icon: "🏠" }, { id: "tips", icon: "🚇" },
] as const;

/** A category that folds open and shut. Closed, it shows just its title and a one-line summary, so the page reads like a menu. */
function Category({ id, title, summary, open, children }: { id: (typeof CATS)[number]["id"]; title: string; summary: string; open?: boolean; children: React.ReactNode }) {
  const icon = CATS.find(c => c.id === id)!.icon;
  return (
    <details id={id} className="guide-cat" open={open}>
      <summary>
        <span className="guide-cat-icon" aria-hidden="true">{icon}</span>
        <span className="guide-cat-head"><h2>{title}</h2><span className="guide-cat-sum">{summary}</span></span>
        <span className="guide-cat-chev" aria-hidden="true" />
      </summary>
      <div className="guide-cat-body">{children}</div>
    </details>
  );
}

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
  const rows = await q<{ id: string; slot: string | null; caption: string }>("SELECT id, slot, caption FROM site_photos ORDER BY position, created_at");
  const photos = new Map(rows.filter(r => r.slot).map(r => [r.slot!, r.id]));
  // Three pictures at the top: the guide banner photo and the home page Pittsburgh photos first, then the drawn scenes.
  const uploaded = [...rows.filter(r => r.slot === "guide-banner"), ...rows.filter(r => r.slot === null)].slice(0, 3);

  return (
    <div className="wrap guide" style={{ paddingBottom: 56 }}>
      <section className="guide-top">
        <div className="guide-top-text">
          <p className="eyebrow">{t("guide.eyebrow")}</p>
          <h1>{t("guide.title")}</h1>
          <p className="lede">{t("guide.intro")}</p>
          {lang !== "en" && <p className="hint">{t("guide.englishNote")}</p>}
        </div>
        <PictureTrio photos={uploaded} />
      </section>
      <section className="guide-hero">
        <GuideNav items={CATS.map(c => ({ id: c.id, icon: c.icon, label: t(`guide.${c.id}`) }))} openAll={t("guide.openAll")} closeAll={t("guide.closeAll")} />
      </section>

      <Category id="yinzer" title={t("guide.yinzer")} summary={t("guide.words", { n: YINZER.length })}>
        <p className="muted">{t("guide.yinzerIntro")}</p>
        <dl className="yinzer">
          {YINZER.map(([w, m]) => <div key={w}><dt>{w}</dt><dd>{m}</dd></div>)}
        </dl>
      </Category>

      {SECTIONS.map(s => (
        <Category key={s.id} id={s.id} title={t(`guide.${s.id}`)} summary={t("guide.places", { n: s.places.length })} open={s.id === "see"}>
          {s.id === "eat" && <p className="muted">{t("guide.eatIntro")}</p>}
          <Grid section={s} photos={photos} t={t} />
        </Category>
      ))}

      <Category id="near" title={t("guide.near")} summary={NEAR.map(n => n.home).join(" · ")}>
        <div className="guide-grid">
          {NEAR.map(n => (
            <article key={n.home} className="guide-card">
              <div className="guide-body">
                <p className="guide-area">{n.area}</p>
                <h3>{n.home}</h3>
                <ul className="near-list">
                  {n.places.map(pl => <li key={pl.name}><a href={mapLink(pl)} target="_blank" rel="noopener noreferrer">📍 {pl.name}</a>{pl.dist && <span className="hint"> · {pl.dist}</span>}</li>)}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </Category>

      <Category id="tips" title={t("guide.tips")} summary={t("guide.tipsSummary")}>
        <ul className="rules">
          <li>{t("guide.tip1")} <a className="tip-link" href={mapLink({ name: "Pittsburgh International Airport", q: "Pittsburgh International Airport (PIT)" })} target="_blank" rel="noopener noreferrer">✈️ Directions to the airport ↗</a></li>
          <li>{t("guide.tip2")} <a className="tip-link" href="https://www.rideprt.org/" target="_blank" rel="noopener noreferrer">🚇 T and bus schedules (PRT) ↗</a></li>
          <li>{t("guide.tip3")} <a className="tip-link" href="https://www.google.com/maps/dir/?api=1&travelmode=transit" target="_blank" rel="noopener noreferrer">🚌 Plan a trip in Google Maps ↗</a> <a className="tip-link" href="https://transitapp.com/" target="_blank" rel="noopener noreferrer">📱 Transit app ↗</a></li>
          <li>{t("guide.tip4")}</li>
          <li>{t("guide.tip5")}</li>
        </ul>
      </Category>

      <section className="block">
        <div className="box" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16, marginTop: 20 }}>
          <div className="stack" style={{ flex: 1, minWidth: 240 }}><h3>{t("guide.ready")}</h3><p className="muted">{t("guide.readyText")}</p></div>
          <Link className="btn btn-primary" href="/stays">{t("guide.cta")}</Link>
        </div>
      </section>
    </div>
  );
}

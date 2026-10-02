import type { Metadata } from "next";
import Link from "next/link";
import { q } from "@/lib/db.ts";
import { PictureTrio } from "@/components/PictureTrio.tsx";
import { GuideAccordion } from "@/components/GuideAccordion.tsx";
import { NEAR, SECTIONS, YINZER, mapLink, slugOf, type Section } from "@/lib/guide.ts";
import { getT } from "@/lib/i18n.ts";
import type { T } from "@/lib/i18n.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pittsburgh guide: what to eat, see and do",
  description: "A local's guide to Pittsburgh: famous food, bars and breweries, historic neighborhoods, museums, game days and Yinzer words.",
};

// Category order, with the icon shown on each collapsible row.
const ORDER = [["yinzer", "guide.yinzer", "🗣️"], ["see", "guide.see", "🏛️"], ["museums", "guide.museums", "🎨"], ["eat", "guide.eat", "🥪"], ["drink", "guide.drink", "🍺"], ["do", "guide.do", "🎢"], ["near", "guide.near", "📍"], ["tips", "guide.tips", "🚌"]] as const;

/** One collapsible category: a tidy row (icon, name, what's inside) that opens to show the places. */
function Fold({ id, icon, title, sub, children }: { id: string; icon: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <details id={id} className="gsec">
      <summary>
        <span className="gsec-ico" aria-hidden>{icon}</span>
        <span className="gsec-txt"><h2>{title}</h2><small>{sub}</small></span>
        <span className="gsec-chev" aria-hidden>⌄</span>
      </summary>
      <div className="gsec-body">{children}</div>
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
  const sec = (id: Section["id"]) => SECTIONS.find(s => s.id === id)!;
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
      <GuideAccordion items={ORDER.map(([id, key, icon]) => ({ id, label: t(key), icon }))} openAll={t("guide.openAll")} closeAll={t("guide.closeAll")} />

      <div className="gsec-list">
        <Fold id="yinzer" icon="🗣️" title={t("guide.yinzer")} sub={`${YINZER.length} words · ${YINZER.slice(0, 3).map(([w]) => w).join(", ")}…`}>
          <p className="muted">{t("guide.yinzerIntro")}</p>
          <dl className="yinzer">
            {YINZER.map(([w, m]) => <div key={w}><dt>{w}</dt><dd>{m}</dd></div>)}
          </dl>
        </Fold>
        {(["see", "museums", "eat", "drink", "do"] as const).map(id => {
          const [, key, icon] = ORDER.find(o => o[0] === id)!;
          const places = sec(id).places;
          return (
            <Fold key={id} id={id} icon={icon} title={t(key)} sub={`${places.length} places · ${places.slice(0, 3).map(p => p.name.split(" & ")[0]).join(", ")}…`}>
              {id === "eat" && <p className="muted">{t("guide.eatIntro")}</p>}
              <Grid section={sec(id)} photos={photos} t={t} />
            </Fold>
          );
        })}
        <Fold id="near" icon="📍" title={t("guide.near")} sub={`${NEAR.length} homes · ${NEAR.map(n => n.home).slice(0, 3).join(", ")}`}>
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
        </Fold>
        <Fold id="tips" icon="🚌" title={t("guide.tips")} sub="Airport, buses, the T and parking">
        <ul className="rules">
          <li>{t("guide.tip1")} <a className="tip-link" href={mapLink({ name: "Pittsburgh International Airport", q: "Pittsburgh International Airport (PIT)" })} target="_blank" rel="noopener noreferrer">✈️ Directions to the airport ↗</a></li>
          <li>{t("guide.tip2")} <a className="tip-link" href="https://www.rideprt.org/" target="_blank" rel="noopener noreferrer">🚇 T and bus schedules (PRT) ↗</a></li>
          <li>{t("guide.tip3")} <a className="tip-link" href="https://www.google.com/maps/dir/?api=1&travelmode=transit" target="_blank" rel="noopener noreferrer">🚌 Plan a trip in Google Maps ↗</a> <a className="tip-link" href="https://transitapp.com/" target="_blank" rel="noopener noreferrer">📱 Transit app ↗</a></li>
          <li>{t("guide.tip4")}</li>
          <li>{t("guide.tip5")}</li>
        </ul>
        </Fold>
      </div>

      <section className="block">
        <div className="box" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16, marginTop: 20 }}>
          <div className="stack" style={{ flex: 1, minWidth: 240 }}><h3>{t("guide.ready")}</h3><p className="muted">{t("guide.readyText")}</p></div>
          <Link className="btn btn-primary" href="/stays">{t("guide.cta")}</Link>
        </div>
      </section>
    </div>
  );
}

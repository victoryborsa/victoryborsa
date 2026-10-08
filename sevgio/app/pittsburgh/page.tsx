import type { Metadata } from "next";
import Link from "next/link";
import { Thumb } from "@/components/Thumb.tsx";
import type { ThumbName } from "@/lib/thumbs.ts";
import { q } from "@/lib/db.ts";
import { PictureTrio } from "@/components/PictureTrio.tsx";
import { CardRow } from "@/components/HomeRows.tsx";
import { GuideFilter } from "@/components/GuideFilter.tsx";
import { NEAR, YINZER, mapLink } from "@/lib/guide.ts";
import { SECTION_TONE, guideSections, placeMapLink, sponsorActive, type GuidePlace } from "@/lib/guide-places.ts";
import { currentUser } from "@/lib/auth.ts";
import { todayLocal } from "@/lib/dates.ts";
import { getT } from "@/lib/i18n.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/pittsburgh" },
  title: "Pittsburgh guide: what to eat, see and do",
  description: "A local's guide to Pittsburgh: famous food, bars and breweries, historic neighborhoods, museums, game days and Yinzer words.",
};

// Rows in order: [id, title key, subtitle, badge on the first cards, tab icon]
const ROWS = [
  ["see", "guide.see", "The places locals take their visitors first", "Must-see", "🏛️"],
  ["museums", "guide.museums", "World-class art, dinosaurs, birds and science", "Local favorite", "🎨"],
  ["eat", "guide.eat", "Sandwiches with the fries inside, pierogies and famous cakes", "Local favorite", "🥪"],
  ["drink", "guide.drink", "Breweries in churches, cocktail streets and city views", "Trending", "🍺"],
  ["do", "guide.do", "Game days, riverboats, trails and coasters", "Trending", "🎢"],
] as const;

/** A drawn picture for a place without an uploaded photo: its section's color, hills and skyline, and its icon. */
function PlaceArt({ p, tone }: { p: { name: string; icon: string }; tone: string }) {
  const seed = [...p.name].reduce((n, c) => n + c.charCodeAt(0), 0);
  const sunX = 60 + (seed % 220);
  return (
    <span className="gp-art" style={{ "--tone": tone } as React.CSSProperties} role="img" aria-label={p.name}>
      <svg viewBox="0 0 400 380" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <circle cx={sunX} cy="88" r="38" fill="#FFE7A3" opacity=".9" />
        <path d={`M0 270 Q 100 ${220 + (seed % 30)} 200 255 T 400 245 V380 H0Z`} fill="rgba(255,255,255,.14)" />
        <g fill="rgba(0,0,0,.28)">
          {[30, 80, 118, 160, 214, 262, 300, 348].map((x, i) => <rect key={x} x={x} y={300 - ((seed >> i) % 5) * 22 - 30} width={36} height={200} rx={2} />)}
        </g>
        <rect y="330" width="400" height="50" fill="rgba(0,0,0,.25)" />
        <path d="M0 336 Q 100 316 200 336 T 400 336" stroke="#FFB612" strokeWidth="5" fill="none" />
      </svg>
      <span className="gp-emoji" aria-hidden>{p.icon}</span>
    </span>
  );
}

function PlaceCard({ p, badge, sponsored, map }: { p: GuidePlace & { previewNote?: string }; badge?: string; sponsored: boolean; map: string }) {
  const tel = p.phone.replace(/[^0-9+]/g, "");
  return (
    <div className={`ab-card gp-card${sponsored ? " gp-sponsored" : ""}`} data-gsearch={`${p.name} ${p.area} ${p.description}`.toLowerCase()}>
      <a href={placeMapLink(p)} target="_blank" rel="noopener noreferrer" className="ab-card-link">
        <span className="ab-ph">
          {p.photos[0] ? <img src={`/api/site-photos/${p.photos[0]}`} alt={p.name} loading="lazy" /> : <PlaceArt p={p} tone={SECTION_TONE[p.section]} />}
          {sponsored ? <span className="ab-badge gp-sponsor-badge">Sponsored</span> : badge && <span className="ab-badge">{badge}</span>}
          {p.previewNote && <span className="gp-preview-note">{p.previewNote}</span>}
        </span>
        <span className="ab-c1 gp-name">{p.name}</span>
        <span className="ab-c2">{p.area}</span>
        <span className="ab-c3 gp-text">{p.description}</span>
        <span className="gp-map">📍 {map} ↗</span>
      </a>
      {(p.website || tel) && (
        <span className="gp-contact">
          {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer sponsored">Website ↗</a>}
          {tel && <a href={`tel:${tel}`}>{p.phone}</a>}
        </span>
      )}
    </div>
  );
}

export default async function PittsburghGuide({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { lang, t } = await getT();
  // Preview (admins only): drafts, hidden places and unpublished changes, exactly as they would look.
  const preview = (await searchParams).preview === "1" && (await currentUser())?.role === "admin";
  const today = todayLocal();
  const places = await guideSections(preview);
  const rows = await q<{ id: string; slot: string | null; caption: string }>("SELECT id, slot, caption FROM site_photos WHERE slot IS NULL OR slot = 'guide-banner' ORDER BY position, created_at");
  const uploaded = [...rows.filter(r => r.slot === "guide-banner"), ...rows.filter(r => r.slot === null)];
  const areas = [...new Set(Object.values(places).flat().map(p => p.area.split(/ & | and |, /)[0]).filter(a => a && !/all over|away/i.test(a)))].sort();
  const tabs: [string, string, ThumbName][] = [["#guide-rows", "All", "city-skyline"], ["#see", "Must-see", "must-see"], ["#museums", "Museums", "museums"], ["#eat", "Eat", "eat"], ["#drink", "Drinks", "drinks"], ["#do", "Things to do", "things-to-do"], ["#near", "Near our homes", "near-our-homes"], ["#yinzer", "Yinzer talk", "yinzer-talk"], ["#tips", "Getting around", "getting-around"]];

  return (
    <div className="ab-home ab-guide">
      {preview && <div className="gp-preview-bar" role="status"><b>Preview.</b> Drafts, hidden places and unpublished changes are shown with a label. Visitors don't see them. <Link href="/admin/guide">Back to Admin</Link></div>}
      <div className="ab-band">
        <nav className="ab-tabs" aria-label="Guide sections">
          {tabs.map(([href, label, icon], i) => <a key={href} href={href} aria-current={i === 0 ? "page" : undefined}><Thumb name={icon} size={44} className="ab-tab-img" />{label}</a>)}
        </nav>
        <GuideFilter areas={areas} target="guide-rows" />
      </div>

      <div className="ab-body" id="guide-rows">
        {ROWS.map(([id, key, sub, badge], ri) => {
          const list = places[id];
          if (!list.length) return null;
          return (
            <div key={id} id={id} className="gp-anchor">
              {ri === 2 && <h2 className="gp-big">Eat, drink and play like a Pittsburgher</h2>}
              <CardRow title={t(key)} sub={sub} href={`#${id}`} limit={4}>
                {list.map((p, i) => <PlaceCard key={p.id} p={p} sponsored={sponsorActive(p, today)} badge={i < 3 ? badge : undefined} map={t("guide.map")} />)}
              </CardRow>
            </div>
          );
        })}

        <div id="near" className="gp-anchor">
          <CardRow title={t("guide.near")} sub="What's around the corner from each of our homes" href="#near" limit={4}>
            {NEAR.map(n => (
              <div key={n.home} className="ab-card gp-near" data-gsearch={`${n.home} ${n.area} ${n.places.map(x => x.name).join(" ")}`.toLowerCase()}>
                <p className="ab-c2">{n.area}</p>
                <h3 className="ab-c1">{n.home}</h3>
                <ul>{n.places.map(pl => <li key={pl.name}><a href={mapLink(pl)} target="_blank" rel="noopener noreferrer">📍 {pl.name}</a>{pl.dist && <span className="hint"> · {pl.dist}</span>}</li>)}</ul>
              </div>
            ))}
          </CardRow>
        </div>

        <div id="yinzer" className="gp-anchor">
          <CardRow title={t("guide.yinzer")} sub={t("guide.yinzerIntro")} href="#yinzer" limit={4}>
            {YINZER.map(([w, m]) => (
              <div key={w} className="ab-card gp-word" data-gsearch={`${w} ${m} yinzer`.toLowerCase()}>
                <span className="gp-word-w">{w}</span>
                <span className="gp-word-m">{m}</span>
              </div>
            ))}
          </CardRow>
        </div>

        <section id="tips" className="gp-anchor gp-tips" aria-labelledby="tips-h">
          <h2 id="tips-h" className="gp-big">{t("guide.tips")}</h2>
          <div className="ab-promos">
            <a className="ab-promo" href={mapLink({ name: "Pittsburgh International Airport", q: "Pittsburgh International Airport (PIT)" })} target="_blank" rel="noopener noreferrer"><span className="ab-promo-ico"><Thumb name="airport" size={64} /></span><span>{t("guide.tip1")}</span><span className="ab-pill">Directions</span></a>
            <a className="ab-promo" href="https://www.rideprt.org/" target="_blank" rel="noopener noreferrer"><span className="ab-promo-ico"><Thumb name="light-rail" size={64} /></span><span>{t("guide.tip2")}</span><span className="ab-pill">Schedules</span></a>
            <a className="ab-promo" href="https://www.google.com/maps/dir/?api=1&travelmode=transit" target="_blank" rel="noopener noreferrer"><span className="ab-promo-ico"><Thumb name="getting-around" size={64} /></span><span>{t("guide.tip3")}</span><span className="ab-pill">Plan a trip</span></a>
          </div>
          <ul className="gp-tiplist"><li>{t("guide.tip4")}</li><li>{t("guide.tip5")}</li></ul>
        </section>

        <section className="ab-welcome">
          <div className="hero-grid home-top">
            <div>
              <p className="eyebrow">{t("guide.eyebrow")}</p>
              <h1>{t("guide.title")}</h1>
              <p className="lede">{t("guide.intro")}</p>
              {lang !== "en" && <p className="hint">{t("guide.englishNote")}</p>}
            </div>
            <PictureTrio photos={uploaded} />
          </div>
        </section>

        <section className="ab-help">
          <div><h3>{t("guide.ready")}</h3><p className="muted">{t("guide.readyText")}</p></div>
          <Link className="btn btn-primary" href="/stays">{t("guide.cta")}</Link>
        </section>
      </div>
    </div>
  );
}

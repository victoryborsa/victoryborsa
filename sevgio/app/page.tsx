import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon.tsx";
import { cookies } from "next/headers";
import { allPublished, photoUrl, type CardProperty } from "@/lib/queries.ts";
import { searchPlaces } from "@/components/SearchBar.tsx";
import { PillSearch } from "@/components/PillSearch.tsx";
import { CardRow, ContinueSearch, FavHeart } from "@/components/HomeRows.tsx";
import { WorldMap } from "@/components/WorldMap.tsx";
import { PictureTrio } from "@/components/PictureTrio.tsx";
import { q } from "@/lib/db.ts";
import { todayLocal } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";
import { priceTag } from "@/lib/pricing.ts";
import { PROPERTY_TYPES } from "@/lib/constants.ts";
import { VISITOR_COOKIE } from "@/lib/listing-stats.ts";
import { getT, LANGS_AZ } from "@/lib/i18n.ts";

export const dynamic = "force-dynamic";

/** "Apartment in Wilkinsburg", "Room in Indiana": the kind of stay and its neighborhood (or town). */
function kindIn(p: CardProperty) {
  const kind = p.parent_id || p.property_type === "room" ? "Room" : PROPERTY_TYPES[p.property_type] || "Home";
  const place = p.area && !/county$/i.test(p.area) ? p.area : p.city;
  return `${kind} in ${place}`;
}

function MiniCard({ p, saved, eager }: { p: CardProperty; saved: boolean; eager?: boolean }) {
  const tag = priceTag(p);
  const fav = p.rating && p.rating >= 4.8 && p.review_count >= 5;
  return (
    <div className="ab-card" data-pid={p.id}>
      <Link href={`/stays/${p.slug}`} className="ab-card-link">
        <span className="ab-ph">
          {p.cover_id ? <img src={photoUrl(p.cover_id, "thumb")} alt={p.title} loading={eager ? "eager" : "lazy"} decoding="async" width={360} height={342} /> : <span className="noph">Photos coming soon</span>}
          {fav && <span className="ab-badge">Guest favorite</span>}
        </span>
        <span className="ab-c1">{kindIn(p)}</span>
        <span className="ab-c2">{p.title}</span>
        {p.host_name && <span className="ab-c2">Hosted by {p.host_name.split(" ")[0]}</span>}
        <span className="ab-c3">{money(tag.cents)} {tag.unit === "month" ? "a month" : "a night"}{p.rating ? <> · <span aria-label={`Rated ${Number(p.rating).toFixed(2)} out of 5`}>★ {Number(p.rating).toFixed(2)}</span></> : <> · New</>}</span>
      </Link>
      <FavHeart id={p.id} saved={saved} />
    </div>
  );
}

const TABS: [string, string, IconName][] = [["/", "All", "all"], ["/stays?kind=home", "Homes", "home"], ["/stays?kind=room", "Rooms", "room"], ["/stays?monthly=1", "Monthly", "calendar"], ["/pittsburgh", "Things to do", "compass"], ["/events", "Events", "ticket"]];

export default async function Home() {
  const visitor = (await cookies()).get(VISITOR_COOKIE)?.value || "";
  const [{ lang, t }, props, places, slides, favs] = await Promise.all([
    getT(), allPublished(), searchPlaces(),
    q<{ id: string; caption: string }>("SELECT id, caption FROM site_photos WHERE slot IS NULL ORDER BY position, created_at LIMIT 20"),
    visitor ? q<{ property_id: string }>("SELECT property_id FROM listing_activity WHERE kind = 'favorite' AND visitor = $1", [visitor]) : Promise.resolve([]),
  ]);
  const saved = new Set(favs.map(f => f.property_id));
  const byRating = [...props].sort((a, b) => (Number(b.rating) || 0) * Math.log(b.review_count + 2) - (Number(a.rating) || 0) * Math.log(a.review_count + 2));
  const city = (c: string) => byRating.filter(p => p.city.toLowerCase() === c);
  const rows: { title: string; href: string; list: CardProperty[] }[] = [
    { title: "Popular homes in Pittsburgh", href: "/stays?loc=Pittsburgh", list: city("pittsburgh") },
    { title: "Stay near IUP in Indiana, PA", href: "/stays?loc=Indiana", list: city("indiana") },
    { title: "Private rooms", href: "/stays?kind=room", list: byRating.filter(p => p.parent_id || p.property_type === "room") },
    { title: "Monthly stays, all-inclusive", href: "/stays?monthly=1", list: byRating.filter(p => p.monthly_price_cents) },
    { title: "More places in Pennsylvania", href: "/stays", list: byRating.filter(p => !["pittsburgh", "indiana"].includes(p.city.toLowerCase())) },
  ].filter(r => r.list.length);
  const firstPhoto = byRating.find(p => p.cover_id)?.cover_id;

  return (
    <div className="ab-home">
      <div className="ab-band">
        <nav className="ab-tabs" aria-label="Browse">
          {TABS.map(([href, label, icon], i) => (
            <Link key={href} href={href} aria-current={i === 0 ? "page" : undefined}><Icon name={icon} size={24} className="ab-tab-ico" />{label}</Link>
          ))}
        </nav>
        <PillSearch places={places} today={todayLocal()} labels={{ where: t("search.where"), when: "When", who: "Who", search: t("search.submit"), anywhere: t("search.anywhere") }} />
      </div>
      <ContinueSearch img={firstPhoto ? photoUrl(firstPhoto, "thumb") : null} />

      <div className="ab-body">
        {rows.length ? rows.map((r, ri) => (
          <CardRow key={r.title} title={r.title} href={r.href}>
            {r.list.map((p, i) => <MiniCard key={p.id} p={p} saved={saved.has(p.id)} eager={ri === 0 && i < 4} />)}
          </CardRow>
        )) : <div className="empty"><h3>New homes are on the way</h3><p className="muted">Check back soon, or contact us and we'll help you find a stay.</p></div>}

        <div className="ab-promos">
          <Link className="ab-promo" href="/stays"><span className="ab-promo-ico"><Icon name="car" size={30} /></span><span>Add airport pickup when you book</span><span className="ab-pill">Find a stay</span></Link>
          <Link className="ab-promo" href="/stays?amen=hottub"><span className="ab-promo-ico"><Icon name="bath" size={30} /></span><span>Explore homes with hot tubs</span><span className="ab-pill">Browse homes</span></Link>
          <Link className="ab-promo" href="/pittsburgh"><span className="ab-promo-ico"><Icon name="compass" size={30} /></span><span>Find things to do in Pittsburgh</span><span className="ab-pill">See the guide</span></Link>
        </div>

        <section className="ab-welcome">
          <div className="hero-grid home-top">
            <div>
              <p className="eyebrow">{t("home.eyebrow")}</p>
              <h1 style={{ marginTop: 10, whiteSpace: "pre-line" }}>{t("home.h1")}</h1>
              <p className="lede">{t("home.lede")}</p>
              <p className="home-welcome">{t("home.welcome")}</p>
              <nav className="hello" aria-label={t("home.pickLang")}>
                {LANGS_AZ.map(l => (
                  <a key={l.code} href={`/lang/${l.code}?next=/`} lang={l.code} hrefLang={l.code} className={l.code === lang ? "on" : undefined} aria-current={l.code === lang ? "true" : undefined} title={l.name}>{l.hello}</a>
                ))}
              </nav>
              <p className="hint" style={{ marginTop: 6 }}>{t("home.pickLang")}</p>
            </div>
            <PictureTrio photos={slides} />
          </div>
          <div className="worldmap-wrap"><WorldMap /></div>
        </section>

        <section className="ab-help">
          <div><h3>{t("home.questions")}</h3><p className="muted">{t("home.questionsText")}</p></div>
          <Link className="btn btn-primary" href="/contact">{t("home.contactUs")}</Link>
        </section>
      </div>
    </div>
  );
}

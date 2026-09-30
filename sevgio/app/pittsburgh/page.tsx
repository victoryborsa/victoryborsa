import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n.ts";
import type { T } from "@/lib/i18n.ts";

export const metadata: Metadata = {
  title: "Pittsburgh guide: what to eat, see and do",
  description: "A local's guide to Pittsburgh: famous food, bars and breweries, historic neighborhoods, museums, game days and Yinzer words.",
};

type Place = { name: string; area: string; text: string; q?: string };
const map = (p: Place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((p.q || p.name) + ", Pittsburgh, PA")}`;

const SEE: Place[] = [
  { name: "Duquesne Incline & Mount Washington", area: "Mount Washington", text: "Ride the 1877 cable car up the hill, then walk Grandview Avenue for the famous view of downtown, the three rivers and the bridges. Magical at sunset." , q: "Duquesne Incline" },
  { name: "Point State Park & Fort Pitt Museum", area: "Downtown", text: "Where the Allegheny and Monongahela meet to form the Ohio. Big fountain, riverfront lawns and the story of the fort that started the city." },
  { name: "Cathedral of Learning & Nationality Rooms", area: "Oakland", text: "A 42-story Gothic tower at the University of Pittsburgh. Its classrooms are decorated in the styles of the countries Pittsburghers came from, including a Turkish room.", q: "Cathedral of Learning" },
  { name: "The Strip District", area: "Strip District", text: "Pittsburgh's historic market street: food shops, fish markets, bakeries, Steelers gear and street vendors. Best on a weekend morning." },
  { name: "Mexican War Streets", area: "North Side", text: "Quiet, tree-lined streets of colorful 1800s row houses and gardens, a short walk from North Shore Nest." },
  { name: "Randyland", area: "North Side", text: "A rainbow-painted folk-art house and courtyard. Free, cheerful and very photogenic." },
  { name: "Heinz History Center", area: "Strip District", text: "The story of Western Pennsylvania, from the French and Indian War to Mister Rogers' Neighborhood and the Steelers." },
  { name: "Market Square", area: "Downtown", text: "Downtown's lively square with cafés and outdoor tables, a farmers market in summer and an ice rink and holiday market in winter nearby." },
];

const MUSEUMS: Place[] = [
  { name: "The Andy Warhol Museum", area: "North Shore", text: "The largest museum dedicated to one artist in North America, in Warhol's hometown." },
  { name: "Carnegie Museums of Art & Natural History", area: "Oakland", text: "Dinosaur Hall, gems and minerals, and world-class art under one roof.", q: "Carnegie Museum of Natural History" },
  { name: "Phipps Conservatory", area: "Schenley Park", text: "A Victorian glasshouse full of gardens and seasonal flower shows." },
  { name: "Carnegie Science Center", area: "North Shore", text: "Hands-on science, a planetarium and a WWII submarine you can walk through. Great with kids." },
  { name: "National Aviary", area: "North Side", text: "Hundreds of birds, many flying free around you. About an 8-minute walk from North Shore Nest." },
  { name: "Mattress Factory", area: "North Side", text: "Room-sized art installations you walk through. Unusual and memorable." },
  { name: "The Frick Pittsburgh", area: "Point Breeze", text: "Gilded Age mansion, art museum, car and carriage museum and gardens, near Frick Park." },
  { name: "Pittsburgh Zoo & PPG Aquarium", area: "Highland Park", text: "Elephants, big cats and a large aquarium. A family favorite." },
];

const EAT: Place[] = [
  { name: "Primanti Bros.", area: "Strip District (original)", text: "The Pittsburgh sandwich: meat, cheese, coleslaw and french fries all inside the bread. Several locations around town." },
  { name: "Pierogies", area: "All over", text: "Potato-and-cheese dumplings, a local obsession. Look for them at church sales, festivals and pierogi shops. At Steelers and Pirates games, the pierogies even race!" , q: "pierogies" },
  { name: "Pamela's Diner", area: "Strip District, Squirrel Hill & more", text: "Famous crêpe-style hotcakes and a classic Pittsburgh breakfast." },
  { name: "DeLuca's Diner", area: "Strip District", text: "Big, old-school breakfasts. Expect a line on weekends." },
  { name: "Wholey's Fish Market", area: "Strip District", text: "A Strip District landmark since 1912 with fresh seafood and a lunch counter.", q: "Robert Wholey Market" },
  { name: "Prantl's Bakery", area: "Shadyside & Market Square", text: "Home of the burnt almond torte, the city's favorite cake." },
  { name: "Mineo's Pizza House", area: "Squirrel Hill", text: "A long-time Pittsburgh pizza favorite, close to Cozy Stay." },
  { name: "Eat'n Park", area: "All over", text: "A local family-restaurant chain. Take home a Smiley Cookie." },
];

const DRINK: Place[] = [
  { name: "Church Brew Works", area: "Lawrenceville", text: "Craft beer brewed in a restored 1900s church, with the brew tanks on the altar." },
  { name: "Penn Brewery", area: "North Side", text: "German-style beers and food in historic brewery buildings near North Shore Nest." },
  { name: "Butler Street", area: "Lawrenceville", text: "Pittsburgh's trendiest strip: breweries, cocktail bars, restaurants and shops.", q: "Butler Street Lawrenceville" },
  { name: "East Carson Street", area: "South Side", text: "The city's classic nightlife street, full of bars, pubs and late-night food.", q: "East Carson Street South Side" },
  { name: "Walnut Street", area: "Shadyside", text: "Boutiques, cafés and relaxed restaurants and bars.", q: "Walnut Street Shadyside" },
  { name: "Grandview Avenue restaurants", area: "Mount Washington", text: "Dinner or drinks with the best view of the city lights.", q: "Grandview Avenue restaurants" },
];

const DO: Place[] = [
  { name: "Steelers game at Acrisure Stadium", area: "North Shore", text: "Wear black and gold and wave a Terrible Towel. About 3 minutes from North Shore Nest.", q: "Acrisure Stadium" },
  { name: "Pirates game at PNC Park", area: "North Shore", text: "One of the most beautiful ballparks in America, with the skyline over the outfield. Walk over the yellow Clemente Bridge.", q: "PNC Park" },
  { name: "Penguins game at PPG Paints Arena", area: "Uptown", text: "Hockey is huge here. The atmosphere is loud and fun.", q: "PPG Paints Arena" },
  { name: "Gateway Clipper riverboat", area: "Station Square", text: "Sightseeing cruises on the three rivers, from Station Square.", q: "Gateway Clipper Fleet" },
  { name: "Three Rivers Heritage Trail", area: "Riverfronts", text: "Walk or bike along the rivers on flat, paved trails. Bike rentals are available near the North Shore." },
  { name: "Kennywood", area: "West Mifflin", text: "A historic amusement park with classic wooden roller coasters. Open in summer and for fall events." },
  { name: "Frick Park & Schenley Park", area: "East End", text: "Big green parks with woodland trails, close to Cozy Stay and the Cozy 3BR House.", q: "Frick Park" },
  { name: "Day trip: Fallingwater", area: "Mill Run, about 1.5 hours away", text: "Frank Lloyd Wright's famous house built over a waterfall. Book tickets ahead. Ohiopyle State Park is right next to it.", q: "Fallingwater, Mill Run, PA" },
];

const NEAR: { home: string; area: string; items: string }[] = [
  { home: "North Shore Nest", area: "North Side / North Shore", items: "Mayfly Market (500 ft), The Lunch Box (1,250 ft), Monterey Pub (1,450 ft), National Aviary, Children's Museum, Andy Warhol Museum (1 mi), PNC Park and Acrisure Stadium, North Side T station (0.9 mi)." },
  { home: "Cozy Stay in Pittsburgh", area: "Swissvale", items: "Frick Park (1.9 mi), Regent Square's cafés and shops, Squirrel Hill's restaurants (about 5 minutes), Shadyside (about 10 minutes), Carnegie Mellon and Chatham universities." },
  { home: "Cozy 3BR House with Garage", area: "East Hills", items: "Royal Caribbean Takeout & Delivery (0.9 mi), Nobleman Cigar Lounge (1.1 mi), Chopstick House (1.2 mi), Frick Park (3.4 mi), Edgewood Town Center, Phipps Conservatory and the Carnegie Museums (about 5 mi)." },
];

const YINZER: [string, string][] = [
  ["Yinz", "You all. \"Are yinz coming to the game?\""], ["N'at", "And that, and so on. \"We got pierogies, kielbasa n'at.\""], ["Dahntahn", "Downtown"],
  ["Redd up", "Tidy up. \"Redd up your room!\""], ["Nebby", "Nosy"], ["Slippy", "Slippery (roads in winter)"], ["Gumband", "Rubber band"],
  ["Jagoff", "An annoying person (not polite!)"], ["Stillers", "The Steelers"], ["Jumbo", "Bologna, the lunch meat"], ["Buggy", "Shopping cart"], ["Yinzer", "A proud Pittsburgher"],
];

function Grid({ items, t }: { items: Place[]; t: T }) {
  return (
    <div className="guide-grid">
      {items.map(p => (
        <article key={p.name} className="guide-card">
          <p className="guide-area">{p.area}</p>
          <h3>{p.name}</h3>
          <p className="muted">{p.text}</p>
          <a href={map(p)} target="_blank" rel="noopener noreferrer" className="guide-map">{t("guide.map")} ↗</a>
        </article>
      ))}
    </div>
  );
}

export default async function PittsburghGuide() {
  const { lang, t } = await getT();
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

      <section id="see" className="block"><h2>{t("guide.see")}</h2><Grid items={SEE} t={t} /></section>
      <section id="museums" className="block"><h2>{t("guide.museums")}</h2><Grid items={MUSEUMS} t={t} /></section>
      <section id="eat" className="block"><h2>{t("guide.eat")}</h2><p className="muted">{t("guide.eatIntro")}</p><Grid items={EAT} t={t} /></section>
      <section id="drink" className="block"><h2>{t("guide.drink")}</h2><Grid items={DRINK} t={t} /></section>
      <section id="do" className="block"><h2>{t("guide.do")}</h2><Grid items={DO} t={t} /></section>

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

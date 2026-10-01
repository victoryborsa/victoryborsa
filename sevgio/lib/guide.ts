// Places in the Pittsburgh guide. Each has an emoji picture until an admin uploads a real photo (Admin → Guide photos).
export type Place = { name: string; area: string; text: string; icon: string; q?: string };
export type Section = { id: "see" | "museums" | "eat" | "drink" | "do"; tone: string; places: Place[] };

export const slugOf = (name: string) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Directions in Google Maps (starts navigation on phones). */
export const mapLink = (p: { name: string; q?: string }) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent((p.q || p.name) + ", Pittsburgh, PA")}`;

export const SECTIONS: Section[] = [
  { id: "see", tone: "#0B2A5B", places: [
    { icon: "🚡", name: "Duquesne Incline & Mount Washington", area: "Mount Washington", text: "Ride the 1877 cable car up the hill for the city's most famous view. Magical at sunset.", q: "Duquesne Incline" },
    { icon: "⛲", name: "Point State Park & Fort Pitt Museum", area: "Downtown", text: "Where the three rivers meet. Big fountain, riverfront lawns and the fort that started the city." },
    { icon: "🏰", name: "Cathedral of Learning & Nationality Rooms", area: "Oakland", text: "A 42-story Gothic tower with classrooms styled after the world's nations, including Turkey.", q: "Cathedral of Learning" },
    { icon: "🛒", name: "The Strip District", area: "Strip District", text: "Historic market street: food shops, fish markets, bakeries and Steelers gear. Go on a weekend morning." },
    { icon: "🏘️", name: "Mexican War Streets", area: "North Side", text: "Colorful 1800s row houses and gardens, a short walk from North Shore Nest." },
    { icon: "🌈", name: "Randyland", area: "North Side", text: "A rainbow-painted folk-art house and courtyard. Free and very photogenic." },
    { icon: "📜", name: "Heinz History Center", area: "Strip District", text: "Western Pennsylvania's story, from the French and Indian War to Mister Rogers." },
    { icon: "⛸️", name: "Market Square", area: "Downtown", text: "Downtown's lively square: cafés and a summer farmers market, with skating and a holiday market nearby in winter." },
  ] },
  { id: "museums", tone: "#7A3E9D", places: [
    { icon: "🎨", name: "The Andy Warhol Museum", area: "North Shore", text: "The largest single-artist museum in North America, in Warhol's hometown." },
    { icon: "🦖", name: "Carnegie Museums of Art & Natural History", area: "Oakland", text: "Dinosaurs, dazzling gems and world-class art under one roof.", q: "Carnegie Museum of Natural History" },
    { icon: "🌺", name: "Phipps Conservatory", area: "Schenley Park", text: "A Victorian glasshouse full of gardens and seasonal flower shows." },
    { icon: "🔭", name: "Carnegie Science Center", area: "North Shore", text: "Hands-on science, a planetarium and a real WWII submarine. Great with kids." },
    { icon: "🦜", name: "National Aviary", area: "North Side", text: "Hundreds of birds, many flying free around you. 8 minutes' walk from North Shore Nest." },
    { icon: "🛏️", name: "Mattress Factory", area: "North Side", text: "Room-sized art installations you walk right through." },
    { icon: "🖼️", name: "The Frick Pittsburgh", area: "Point Breeze", text: "A Gilded Age mansion, art, classic cars and gardens." },
    { icon: "🐘", name: "Pittsburgh Zoo & PPG Aquarium", area: "Highland Park", text: "Elephants, big cats and a large aquarium. A family favorite." },
  ] },
  { id: "eat", tone: "#B3262B", places: [
    { icon: "🥪", name: "Primanti Bros.", area: "Strip District & more", text: "The Pittsburgh sandwich, with the fries and coleslaw inside the bread." },
    { icon: "🥟", name: "Pierogies", area: "All over", text: "Potato-and-cheese dumplings, a local obsession. At ballgames the pierogies even race!", q: "pierogies" },
    { icon: "🥞", name: "Pamela's Diner", area: "Strip District, Squirrel Hill & more", text: "Famous crêpe-style hotcakes and a classic Pittsburgh breakfast." },
    { icon: "🍳", name: "DeLuca's Diner", area: "Strip District", text: "Big, old-school breakfasts. Expect a line on weekends." },
    { icon: "🐟", name: "Wholey's Fish Market", area: "Strip District", text: "A Strip District landmark since 1912, with a busy lunch counter.", q: "Robert Wholey Market" },
    { icon: "🍰", name: "Prantl's Bakery", area: "Shadyside & Market Square", text: "Home of the burnt almond torte, the city's favorite cake." },
    { icon: "🍕", name: "Mineo's Pizza House", area: "Squirrel Hill", text: "A long-time pizza favorite, close to Cozy Stay." },
    { icon: "🍪", name: "Eat'n Park", area: "All over", text: "Local family diners. Take home a Smiley Cookie." },
  ] },
  { id: "drink", tone: "#C47A00", places: [
    { icon: "⛪", name: "Church Brew Works", area: "Lawrenceville", text: "Craft beer brewed in a restored church, with tanks on the altar." },
    { icon: "🍺", name: "Penn Brewery", area: "North Side", text: "German-style beers in historic brewery buildings near North Shore Nest." },
    { icon: "🍸", name: "Butler Street", area: "Lawrenceville", text: "The trendiest strip: breweries, cocktail bars and restaurants.", q: "Butler Street Lawrenceville" },
    { icon: "🎶", name: "East Carson Street", area: "South Side", text: "The classic nightlife street, full of bars and late-night food.", q: "East Carson Street South Side" },
    { icon: "🛍️", name: "Walnut Street", area: "Shadyside", text: "Boutiques, cafés and relaxed restaurants.", q: "Walnut Street Shadyside" },
    { icon: "🌃", name: "Grandview Avenue restaurants", area: "Mount Washington", text: "Dinner or drinks with the best view of the city lights.", q: "Grandview Avenue restaurants" },
  ] },
  { id: "do", tone: "#0A6B66", places: [
    { icon: "🏈", name: "Steelers game at Acrisure Stadium", area: "North Shore", text: "Wear black and gold and wave a Terrible Towel. 3 minutes from North Shore Nest.", q: "Acrisure Stadium" },
    { icon: "⚾", name: "Pirates game at PNC Park", area: "North Shore", text: "A gorgeous ballpark with the skyline over the outfield.", q: "PNC Park" },
    { icon: "🏒", name: "Penguins game at PPG Paints Arena", area: "Uptown", text: "Hockey is huge here, and the crowd is loud and fun.", q: "PPG Paints Arena" },
    { icon: "🛥️", name: "Gateway Clipper riverboat", area: "Station Square", text: "Sightseeing cruises on the three rivers.", q: "Gateway Clipper Fleet" },
    { icon: "🚲", name: "Three Rivers Heritage Trail", area: "Riverfronts", text: "Flat, paved riverside trails for walking and biking." },
    { icon: "🎢", name: "Kennywood", area: "West Mifflin", text: "A historic amusement park with classic wooden coasters." },
    { icon: "🌳", name: "Frick Park & Schenley Park", area: "East End", text: "Big green parks with woodland trails, near Cozy Stay and the Cozy 3BR House.", q: "Frick Park" },
    { icon: "🏞️", name: "Day trip: Fallingwater", area: "About 1.5 hours away", text: "Frank Lloyd Wright's house over a waterfall. Book ahead; Ohiopyle State Park is next door.", q: "Fallingwater, Mill Run, PA" },
  ] },
];

export type NearPlace = { name: string; dist?: string; q?: string };
export const NEAR: { home: string; area: string; places: NearPlace[] }[] = [
  { home: "North Shore Nest", area: "North Side / North Shore", places: [
    { name: "Mayfly Market", dist: "500 ft" }, { name: "The Lunch Box", dist: "1,250 ft" }, { name: "Monterey Pub", dist: "1,450 ft" },
    { name: "National Aviary" }, { name: "Children's Museum of Pittsburgh", q: "Children's Museum of Pittsburgh" }, { name: "Andy Warhol Museum", dist: "1 mi" },
    { name: "PNC Park" }, { name: "Acrisure Stadium" }, { name: "North Side T station", dist: "0.9 mi", q: "North Side Station, Pittsburgh" },
  ] },
  { home: "Cozy Stay in Pittsburgh", area: "Swissvale", places: [
    { name: "Frick Park", dist: "1.9 mi" }, { name: "Regent Square cafés and shops", q: "Regent Square, Pittsburgh" }, { name: "Squirrel Hill restaurants", dist: "about 5 min", q: "Squirrel Hill, Pittsburgh" },
    { name: "Shadyside", dist: "about 10 min", q: "Walnut Street, Shadyside, Pittsburgh" }, { name: "Carnegie Mellon University" }, { name: "Chatham University" },
  ] },
  { home: "Cozy 3BR House with Garage", area: "East Hills", places: [
    { name: "Royal Caribbean Takeout & Delivery", dist: "0.9 mi" }, { name: "Nobleman Cigar Lounge", dist: "1.1 mi" }, { name: "Chopstick House", dist: "1.2 mi" },
    { name: "Frick Park", dist: "3.4 mi" }, { name: "Edgewood Town Center" }, { name: "Phipps Conservatory", dist: "about 5 mi" }, { name: "Carnegie Museums", dist: "about 5 mi", q: "Carnegie Museum of Natural History" },
  ] },
];

export const YINZER: [string, string][] = [
  ["Yinz", "You all. \"Are yinz coming to the game?\""], ["N'at", "And that, and so on. \"We got pierogies, kielbasa n'at.\""], ["Dahntahn", "Downtown"],
  ["Redd up", "Tidy up. \"Redd up your room!\""], ["Nebby", "Nosy"], ["Slippy", "Slippery (roads in winter)"], ["Gumband", "Rubber band"],
  ["Jagoff", "An annoying person (not polite!)"], ["Stillers", "The Steelers"], ["Jumbo", "Bologna, the lunch meat"], ["Buggy", "Shopping cart"], ["Yinzer", "A proud Pittsburgher"],
];

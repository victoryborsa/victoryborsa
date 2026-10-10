-- Pittsburgh guide places, managed in Admin → Pittsburgh guide (add, edit, order, hide, sponsor).
-- Starts with the places that used to be written into the code. Photos move from the place's name to its id.
CREATE TABLE guide_places (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section       text NOT NULL CHECK (section IN ('see', 'museums', 'eat', 'drink', 'do')),
  position      integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden')),
  name          text NOT NULL,
  area          text NOT NULL DEFAULT '',
  description   text NOT NULL DEFAULT '',
  icon          text NOT NULL DEFAULT '📍',
  address       text NOT NULL DEFAULT '',
  map_query     text NOT NULL DEFAULT '',
  website       text NOT NULL DEFAULT '',
  phone         text NOT NULL DEFAULT '',
  sponsored     boolean NOT NULL DEFAULT false,
  sponsor_start date,
  sponsor_end   date,
  draft         jsonb,
  slug          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guide_places_order ON guide_places (section, position);
CREATE INDEX site_photos_slot ON site_photos (slot);

INSERT INTO guide_places (section, position, status, name, area, description, icon, map_query, slug) VALUES
  ('see', 0, 'published', 'Duquesne Incline & Mount Washington', 'Mount Washington', 'Ride the 1877 cable car up the hill for the city''s most famous view. Magical at sunset.', '🚡', 'Duquesne Incline', 'duquesne-incline-and-mount-washington'),
  ('see', 1, 'published', 'Point State Park & Fort Pitt Museum', 'Downtown', 'Where the three rivers meet. Big fountain, riverfront lawns and the fort that started the city.', '⛲', '', 'point-state-park-and-fort-pitt-museum'),
  ('see', 2, 'published', 'Cathedral of Learning & Nationality Rooms', 'Oakland', 'A 42-story Gothic tower with classrooms styled after the world''s nations, including Turkey.', '🏰', 'Cathedral of Learning', 'cathedral-of-learning-and-nationality-rooms'),
  ('see', 3, 'published', 'The Strip District', 'Strip District', 'Historic market street: food shops, fish markets, bakeries and Steelers gear. Go on a weekend morning.', '🛒', '', 'the-strip-district'),
  ('see', 4, 'published', 'Mexican War Streets', 'North Side', 'Colorful 1800s row houses and gardens, a short walk from North Shore Nest.', '🏘️', '', 'mexican-war-streets'),
  ('see', 5, 'published', 'Randyland', 'North Side', 'A rainbow-painted folk-art house and courtyard. Free and very photogenic.', '🌈', '', 'randyland'),
  ('see', 6, 'published', 'Heinz History Center', 'Strip District', 'Western Pennsylvania''s story, from the French and Indian War to Mister Rogers.', '📜', '', 'heinz-history-center'),
  ('see', 7, 'published', 'Market Square', 'Downtown', 'Downtown''s lively square: cafés and a summer farmers market, with skating and a holiday market nearby in winter.', '⛸️', '', 'market-square'),
  ('museums', 0, 'published', 'The Andy Warhol Museum', 'North Shore', 'The largest single-artist museum in North America, in Warhol''s hometown.', '🎨', '', 'the-andy-warhol-museum'),
  ('museums', 1, 'published', 'Carnegie Museums of Art & Natural History', 'Oakland', 'Dinosaurs, dazzling gems and world-class art under one roof.', '🦖', 'Carnegie Museum of Natural History', 'carnegie-museums-of-art-and-natural-history'),
  ('museums', 2, 'published', 'Phipps Conservatory', 'Schenley Park', 'A Victorian glasshouse full of gardens and seasonal flower shows.', '🌺', '', 'phipps-conservatory'),
  ('museums', 3, 'published', 'Carnegie Science Center', 'North Shore', 'Hands-on science, a planetarium and a real WWII submarine. Great with kids.', '🔭', '', 'carnegie-science-center'),
  ('museums', 4, 'published', 'National Aviary', 'North Side', 'Hundreds of birds, many flying free around you. 8 minutes'' walk from North Shore Nest.', '🦜', '', 'national-aviary'),
  ('museums', 5, 'published', 'Mattress Factory', 'North Side', 'Room-sized art installations you walk right through.', '🛏️', '', 'mattress-factory'),
  ('museums', 6, 'published', 'The Frick Pittsburgh', 'Point Breeze', 'A Gilded Age mansion, art, classic cars and gardens.', '🖼️', '', 'the-frick-pittsburgh'),
  ('museums', 7, 'published', 'Pittsburgh Zoo & PPG Aquarium', 'Highland Park', 'Elephants, big cats and a large aquarium. A family favorite.', '🐘', '', 'pittsburgh-zoo-and-ppg-aquarium'),
  ('eat', 0, 'published', 'Primanti Bros.', 'Strip District & more', 'The Pittsburgh sandwich, with the fries and coleslaw inside the bread.', '🥪', '', 'primanti-bros'),
  ('eat', 1, 'published', 'Pierogies', 'All over', 'Potato-and-cheese dumplings, a local obsession. At ballgames the pierogies even race!', '🥟', 'pierogies', 'pierogies'),
  ('eat', 2, 'published', 'Pamela''s Diner', 'Strip District, Squirrel Hill & more', 'Famous crêpe-style hotcakes and a classic Pittsburgh breakfast.', '🥞', '', 'pamela-s-diner'),
  ('eat', 3, 'published', 'DeLuca''s Diner', 'Strip District', 'Big, old-school breakfasts. Expect a line on weekends.', '🍳', '', 'deluca-s-diner'),
  ('eat', 4, 'published', 'Wholey''s Fish Market', 'Strip District', 'A Strip District landmark since 1912, with a busy lunch counter.', '🐟', 'Robert Wholey Market', 'wholey-s-fish-market'),
  ('eat', 5, 'published', 'Prantl''s Bakery', 'Shadyside & Market Square', 'Home of the burnt almond torte, the city''s favorite cake.', '🍰', '', 'prantl-s-bakery'),
  ('eat', 6, 'published', 'Mineo''s Pizza House', 'Squirrel Hill', 'A long-time pizza favorite, close to Cozy Stay.', '🍕', '', 'mineo-s-pizza-house'),
  ('eat', 7, 'published', 'Eat''n Park', 'All over', 'Local family diners. Take home a Smiley Cookie.', '🍪', '', 'eat-n-park'),
  ('drink', 0, 'published', 'Church Brew Works', 'Lawrenceville', 'Craft beer brewed in a restored church, with tanks on the altar.', '⛪', '', 'church-brew-works'),
  ('drink', 1, 'published', 'Penn Brewery', 'North Side', 'German-style beers in historic brewery buildings near North Shore Nest.', '🍺', '', 'penn-brewery'),
  ('drink', 2, 'published', 'Butler Street', 'Lawrenceville', 'The trendiest strip: breweries, cocktail bars and restaurants.', '🍸', 'Butler Street Lawrenceville', 'butler-street'),
  ('drink', 3, 'published', 'East Carson Street', 'South Side', 'The classic nightlife street, full of bars and late-night food.', '🎶', 'East Carson Street South Side', 'east-carson-street'),
  ('drink', 4, 'published', 'Walnut Street', 'Shadyside', 'Boutiques, cafés and relaxed restaurants.', '🛍️', 'Walnut Street Shadyside', 'walnut-street'),
  ('drink', 5, 'published', 'Grandview Avenue restaurants', 'Mount Washington', 'Dinner or drinks with the best view of the city lights.', '🌃', 'Grandview Avenue restaurants', 'grandview-avenue-restaurants'),
  ('do', 0, 'published', 'Steelers game at Acrisure Stadium', 'North Shore', 'Wear black and gold and wave a Terrible Towel. 3 minutes from North Shore Nest.', '🏈', 'Acrisure Stadium', 'steelers-game-at-acrisure-stadium'),
  ('do', 1, 'published', 'Pirates game at PNC Park', 'North Shore', 'A gorgeous ballpark with the skyline over the outfield.', '⚾', 'PNC Park', 'pirates-game-at-pnc-park'),
  ('do', 2, 'published', 'Penguins game at PPG Paints Arena', 'Uptown', 'Hockey is huge here, and the crowd is loud and fun.', '🏒', 'PPG Paints Arena', 'penguins-game-at-ppg-paints-arena'),
  ('do', 3, 'published', 'Gateway Clipper riverboat', 'Station Square', 'Sightseeing cruises on the three rivers.', '🛥️', 'Gateway Clipper Fleet', 'gateway-clipper-riverboat'),
  ('do', 4, 'published', 'Three Rivers Heritage Trail', 'Riverfronts', 'Flat, paved riverside trails for walking and biking.', '🚲', '', 'three-rivers-heritage-trail'),
  ('do', 5, 'published', 'Kennywood', 'West Mifflin', 'A historic amusement park with classic wooden coasters.', '🎢', '', 'kennywood'),
  ('do', 6, 'published', 'Frick Park & Schenley Park', 'East End', 'Big green parks with woodland trails, near Cozy Stay and the Cozy 3BR House.', '🌳', 'Frick Park', 'frick-park-and-schenley-park'),
  ('do', 7, 'published', 'Day trip: Fallingwater', 'About 1.5 hours away', 'Frank Lloyd Wright''s house over a waterfall. Book ahead; Ohiopyle State Park is next door.', '🏞️', 'Fallingwater, Mill Run, PA', 'day-trip-fallingwater');

UPDATE site_photos s SET slot = 'place:' || g.id FROM guide_places g WHERE s.slot = g.slug;


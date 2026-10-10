-- Where a listing is on the map, looked up from its address. Guests only ever see an approximate spot.
ALTER TABLE properties ADD COLUMN lat double precision;
ALTER TABLE properties ADD COLUMN lng double precision;
ALTER TABLE properties ADD COLUMN geocoded_at timestamptz;   -- last lookup attempt (found or not)

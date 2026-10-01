-- Smart pricing: nightly prices follow demand (events, holidays, weekends) between the host's minimum and maximum.
ALTER TABLE properties ADD COLUMN smart_pricing boolean NOT NULL DEFAULT false;
ALTER TABLE properties ADD COLUMN min_price_cents int CHECK (min_price_cents > 0);
ALTER TABLE properties ADD COLUMN max_price_cents int CHECK (max_price_cents > 0);

-- Monthly rentals (Furnished Finder style): an all-inclusive rent per month, for stays of a month or more.
ALTER TABLE properties ADD COLUMN monthly_price_cents int CHECK (monthly_price_cents > 0);

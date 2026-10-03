-- Furnished & corporate housing page: which homes are shown there, with their fixed all-inclusive monthly rate and fees.
ALTER TABLE properties
  ADD COLUMN corp_listed boolean NOT NULL DEFAULT false,
  ADD COLUMN corp_monthly_cents int CHECK (corp_monthly_cents > 0),
  ADD COLUMN corp_deposit_cents int NOT NULL DEFAULT 0 CHECK (corp_deposit_cents >= 0),
  ADD COLUMN corp_cleaning_cents int NOT NULL DEFAULT 0 CHECK (corp_cleaning_cents >= 0),
  ADD COLUMN corp_pet_fee_cents int NOT NULL DEFAULT 0 CHECK (corp_pet_fee_cents >= 0),
  ADD COLUMN corp_available_from date,
  ADD COLUMN furnished_finder_url text NOT NULL DEFAULT '';

-- The three entire homes the owner asked for. Matched by title; anything not found can be switched on in the listing form.
UPDATE properties SET corp_listed = true, corp_monthly_cents = 230000, corp_deposit_cents = 50000, corp_cleaning_cents = 30000, corp_pet_fee_cents = 50000
  WHERE parent_id IS NULL AND property_type <> 'room' AND (title ILIKE 'cozy 3%' OR title ILIKE '%3-bedroom house with garage%' OR title ILIKE '%3br house%');
UPDATE properties SET corp_listed = true, corp_monthly_cents = 400000, corp_deposit_cents = 100000, corp_cleaning_cents = 50000, corp_pet_fee_cents = 0
  WHERE parent_id IS NULL AND property_type <> 'room' AND title ILIKE '%meadow wood%';
UPDATE properties SET corp_listed = true, corp_monthly_cents = 450000, corp_deposit_cents = 10000, corp_cleaning_cents = 45000, corp_pet_fee_cents = 75000
  WHERE parent_id IS NULL AND property_type <> 'room' AND title ILIKE '%north shore nest%';

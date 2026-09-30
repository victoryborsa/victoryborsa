-- Richer listing details, guest-based pricing, children, and management fees.
ALTER TABLE properties
  ADD COLUMN beds_detail jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN half_bathrooms int NOT NULL DEFAULT 0 CHECK (half_bathrooms BETWEEN 0 AND 10),
  ADD COLUMN kitchen_access text NOT NULL DEFAULT 'private' CHECK (kitchen_access IN ('private', 'shared', 'none')),
  ADD COLUMN laundry_access text NOT NULL DEFAULT 'none' CHECK (laundry_access IN ('private', 'shared', 'none')),
  ADD COLUMN stairs_info text NOT NULL DEFAULT '',
  ADD COLUMN has_exterior_cameras boolean NOT NULL DEFAULT false,
  ADD COLUMN camera_locations text NOT NULL DEFAULT '',
  ADD COLUMN base_occupancy int CHECK (base_occupancy IS NULL OR base_occupancy >= 1),
  ADD COLUMN extra_guest_fee_cents int NOT NULL DEFAULT 0 CHECK (extra_guest_fee_cents >= 0),
  ADD COLUMN fewer_guest_discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (fewer_guest_discount_percent BETWEEN 0 AND 50),
  ADD COLUMN weekly_discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (weekly_discount_percent BETWEEN 0 AND 80),
  ADD COLUMN monthly_discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (monthly_discount_percent BETWEEN 0 AND 80),
  ADD COLUMN children_free_age int NOT NULL DEFAULT 2 CHECK (children_free_age BETWEEN 0 AND 17),
  ADD COLUMN management_fee_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (management_fee_percent BETWEEN 0 AND 100);

-- Split existing "1.5 bathrooms" style values into full + half bathrooms.
UPDATE properties SET half_bathrooms = 1, bathrooms = floor(bathrooms) WHERE bathrooms <> floor(bathrooms);

ALTER TABLE bookings
  ADD COLUMN adults int,
  ADD COLUMN children int NOT NULL DEFAULT 0,
  ADD COLUMN free_children int NOT NULL DEFAULT 0,
  ADD COLUMN lodging_cents int,
  ADD COLUMN discount_cents int NOT NULL DEFAULT 0,
  ADD COLUMN management_fee_percent numeric(5,2) NOT NULL DEFAULT 0;
UPDATE bookings SET adults = guests, lodging_cents = nights * nightly_price_cents WHERE adults IS NULL;
ALTER TABLE bookings ALTER COLUMN adults SET NOT NULL, ALTER COLUMN lodging_cents SET NOT NULL;

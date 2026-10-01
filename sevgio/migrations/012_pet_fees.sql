-- Pets: a listing with "Pets allowed" can be free or charge a fee per stay, per night, per pet, or per pet per night.
ALTER TABLE properties ADD COLUMN pet_fee_cents int NOT NULL DEFAULT 0 CHECK (pet_fee_cents >= 0);
ALTER TABLE properties ADD COLUMN pet_fee_per text NOT NULL DEFAULT 'stay' CHECK (pet_fee_per IN ('stay', 'night', 'pet_stay', 'pet_night'));
ALTER TABLE bookings ADD COLUMN pets int NOT NULL DEFAULT 0 CHECK (pets >= 0);
ALTER TABLE bookings ADD COLUMN pet_fee_cents int NOT NULL DEFAULT 0 CHECK (pet_fee_cents >= 0);

-- Paid extra services a listing offers (airport pickup, city tour, …) and a refundable security deposit.
ALTER TABLE properties ADD COLUMN services jsonb NOT NULL DEFAULT '[]';
ALTER TABLE properties ADD COLUMN security_deposit_cents int NOT NULL DEFAULT 0 CHECK (security_deposit_cents >= 0);
ALTER TABLE bookings ADD COLUMN services jsonb NOT NULL DEFAULT '[]';       -- what the guest chose, with prices at booking time
ALTER TABLE bookings ADD COLUMN services_cents int NOT NULL DEFAULT 0 CHECK (services_cents >= 0);
ALTER TABLE bookings ADD COLUMN security_deposit_cents int NOT NULL DEFAULT 0 CHECK (security_deposit_cents >= 0);

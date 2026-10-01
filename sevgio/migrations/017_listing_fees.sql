-- Yearly listing fee that hosts pay to list a property (admins can waive it per listing).
ALTER TABLE properties ADD COLUMN listing_paid_until date;
ALTER TABLE properties ADD COLUMN listing_fee_waived boolean NOT NULL DEFAULT false;
ALTER TABLE properties ADD COLUMN listing_fee_reminded_at timestamptz;
INSERT INTO settings (key, value) VALUES ('listing_fee_enabled', 'true'), ('listing_fee_cents', '10000') ON CONFLICT (key) DO NOTHING;

-- Corporate-housing reservations entered by an admin: a fixed negotiated total (not the nightly rates), a deposit,
-- a payment due date for the balance, and a flat card fee. Cash App joins the ways to pay.
-- `ical_fetches` records when each outside site (Airbnb, Booking.com, Vrbo, Furnished Finder…) last read a listing's
-- Sevgio calendar link, so the host can see the link is really being used.
ALTER TABLE bookings
  ADD COLUMN fixed_price boolean NOT NULL DEFAULT false,
  ADD COLUMN deposit_due_cents int NOT NULL DEFAULT 0 CHECK (deposit_due_cents >= 0),
  ADD COLUMN payment_due_date date,
  ADD COLUMN card_fee_flat_cents int CHECK (card_fee_flat_cents IS NULL OR card_fee_flat_cents >= 0);

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_method_check CHECK (payment_method IN ('card', 'ach', 'zelle', 'venmo', 'cashapp', 'cash'));

CREATE TABLE ical_fetches (
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  site        text NOT NULL,
  agent       text NOT NULL DEFAULT '',
  last_at     timestamptz NOT NULL DEFAULT now(),
  fetches     int NOT NULL DEFAULT 1,
  PRIMARY KEY (property_id, site)
);

INSERT INTO settings (key, value) VALUES ('cashapp_handle', '""'), ('corporate_card_fee_cents', '300')
ON CONFLICT (key) DO NOTHING;

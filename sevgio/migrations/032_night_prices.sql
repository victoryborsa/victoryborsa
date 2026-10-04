-- Nightly prices the host sets by hand for specific nights (from the listing's calendar).
-- They replace the normal price and Smart Pricing for that night only. Saved bookings keep the price they were booked at.
CREATE TABLE night_prices (
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  night       date NOT NULL,
  price_cents int  NOT NULL CHECK (price_cents > 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, night)
);

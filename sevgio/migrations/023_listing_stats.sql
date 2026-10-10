-- Listing stats shown on each listing: views, saved as favourite, interested, shared.
-- One row per visitor per listing: views and shares once per day, favourite and interested once (removed when switched off).
CREATE TABLE listing_activity (
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('view', 'favorite', 'interested', 'share')),
  visitor     text NOT NULL,
  day         date NOT NULL DEFAULT '2000-01-01',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, kind, visitor, day)
);

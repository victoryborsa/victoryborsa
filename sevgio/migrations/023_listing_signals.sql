-- What visitors do on a listing: view it, save it as a favourite, show interest (Reserve / ask the host) and share it.
-- One row per visitor per signal. "k" makes a row unique: the day for views, channel + day for shares, empty for the rest.
CREATE TABLE listing_signals (
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('view', 'favorite', 'interested', 'share')),
  visitor     text NOT NULL,
  k           text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, kind, visitor, k)
);

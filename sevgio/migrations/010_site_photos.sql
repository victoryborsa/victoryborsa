-- Photos for the home page slideshow (Pittsburgh scenes), managed in Admin → Settings.
CREATE TABLE site_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position    int  NOT NULL DEFAULT 0,
  caption     text NOT NULL DEFAULT '',
  large       bytea NOT NULL,
  thumb       bytea NOT NULL,
  width       int NOT NULL,
  height      int NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

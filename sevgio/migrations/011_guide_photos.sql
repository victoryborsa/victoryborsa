-- Site photos can belong to the home slideshow (slot NULL) or to one place in the Pittsburgh guide (slot = place slug).
ALTER TABLE site_photos ADD COLUMN slot text;
CREATE UNIQUE INDEX site_photos_slot_idx ON site_photos (slot) WHERE slot IS NOT NULL;

-- A listing can be "part of" a whole-home listing (e.g. a private room inside a house).
-- Booking the whole home blocks its rooms, and booking any room blocks the whole home.
ALTER TABLE properties ADD COLUMN parent_id uuid REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE properties ADD CONSTRAINT properties_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);
CREATE INDEX properties_parent_idx ON properties (parent_id);

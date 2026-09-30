-- Whether the listing's bathroom(s) are private to the guest or shared with other guests.
ALTER TABLE properties ADD COLUMN bathroom_type text NOT NULL DEFAULT 'private' CHECK (bathroom_type IN ('private', 'shared'));

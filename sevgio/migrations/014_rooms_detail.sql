-- Bedroom-by-bedroom details shown to guests: name, beds with sizes, room size, a note and a photo.
ALTER TABLE properties ADD COLUMN rooms_detail jsonb NOT NULL DEFAULT '[]';

-- Addresses OpenStreetMap couldn't find get looked up again, now also with the US Census Bureau's address finder.
UPDATE properties SET geocoded_at = NULL WHERE lat IS NULL;

-- Order of homes on the Corporate Housing page (1 = first). Homes without a number follow, cheapest first.
ALTER TABLE properties ADD COLUMN corp_position int CHECK (corp_position BETWEEN 1 AND 999);
UPDATE properties SET corp_position = 1 WHERE slug = 'north-shore-nest-entire-house-pittsburgh';

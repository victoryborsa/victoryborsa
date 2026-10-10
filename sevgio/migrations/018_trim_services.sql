-- "Uber / Lyft ride" and "Groceries" are no longer offered: remove them from listings that ticked them.
UPDATE properties
   SET services = COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(services) e WHERE e->>'key' NOT IN ('ride', 'grocery')), '[]'::jsonb)
 WHERE jsonb_typeof(services) = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(services) e WHERE e->>'key' IN ('ride', 'grocery'));

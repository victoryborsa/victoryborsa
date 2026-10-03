-- The private rooms of North Shore Nest also go on the Corporate Housing page, right after the whole house.
UPDATE properties SET corp_listed = true, corp_monthly_cents = 170000, corp_deposit_cents = 50000, corp_cleaning_cents = 15000, corp_pet_fee_cents = 50000, corp_position = 2
  WHERE parent_id = (SELECT id FROM properties WHERE slug = 'north-shore-nest-entire-house-pittsburgh');

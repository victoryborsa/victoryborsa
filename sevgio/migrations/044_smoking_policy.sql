-- Smoking policy as its own field (master source), instead of free-text house rules. Existing listings start as "No smoking"
-- unless a house rule already says smoking is allowed outside or allowed.
ALTER TABLE properties ADD COLUMN smoking text NOT NULL DEFAULT 'no' CHECK (smoking IN ('no', 'outside', 'yes'));
UPDATE properties SET smoking = 'outside' WHERE EXISTS (SELECT 1 FROM unnest(house_rules) r WHERE r ~* 'smok\w* (is )?(allowed|permitted|ok)\s+(only\s+)?(outside|outdoors|on the porch|on the patio)');

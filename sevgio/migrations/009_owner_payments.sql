-- Optional owner accounts per listing. When set, guests of this listing pay the owner directly instead of the site-wide account.
ALTER TABLE properties ADD COLUMN owner_zelle text NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN owner_venmo text NOT NULL DEFAULT '';

-- Who pays the utilities, shown under the price: '' = not shown, 'included' = all-inclusive, 'tenant' = paid by tenant.
ALTER TABLE properties ADD COLUMN utilities text NOT NULL DEFAULT '' CHECK (utilities IN ('', 'included', 'tenant'));

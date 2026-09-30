-- Which spaces guests share with others (shown in "Good to know"), e.g. for private rooms in a home.
ALTER TABLE properties ADD COLUMN shared_spaces text NOT NULL DEFAULT '';

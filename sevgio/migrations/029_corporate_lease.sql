-- Corporate Housing page: unfurnished homes and long-term leases that people apply for instead of booking online.
ALTER TABLE properties
  ADD COLUMN corp_furnished boolean NOT NULL DEFAULT true,
  ADD COLUMN corp_lease_only boolean NOT NULL DEFAULT false,  -- shown only on the Corporate Housing page; no calendar booking
  ADD COLUMN corp_app_fee_cents int NOT NULL DEFAULT 0 CHECK (corp_app_fee_cents >= 0),
  ADD COLUMN corp_apply_url text NOT NULL DEFAULT '',
  ADD COLUMN corp_price_note text NOT NULL DEFAULT '';

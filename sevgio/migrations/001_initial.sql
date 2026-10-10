-- Sevgio initial schema
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  name          text NOT NULL,
  phone         text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'host', 'admin')),
  disabled      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE sessions (
  id          text PRIMARY KEY,            -- sha256 of the cookie token; the raw token is never stored
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  user_agent  text NOT NULL DEFAULT ''
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE password_resets (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE TABLE login_attempts (
  id       bigserial PRIMARY KEY,
  email    text NOT NULL,
  ip       text NOT NULL DEFAULT '',
  success  boolean NOT NULL,
  at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email_idx ON login_attempts (lower(email), at);

CREATE TABLE properties (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 text NOT NULL UNIQUE,
  host_id              uuid NOT NULL REFERENCES users(id),
  title                text NOT NULL,
  city                 text NOT NULL,
  area                 text NOT NULL DEFAULT '',
  address              text NOT NULL DEFAULT '',  -- shared with guests only after booking is confirmed
  description          text NOT NULL DEFAULT '',
  property_type        text NOT NULL DEFAULT 'house',
  max_guests           int  NOT NULL CHECK (max_guests BETWEEN 1 AND 50),
  bedrooms             int  NOT NULL DEFAULT 1 CHECK (bedrooms >= 0),
  beds                 int  NOT NULL DEFAULT 1 CHECK (beds >= 0),
  bathrooms            numeric(3,1) NOT NULL DEFAULT 1 CHECK (bathrooms >= 0),
  nightly_price_cents  int  NOT NULL CHECK (nightly_price_cents > 0),
  cleaning_fee_cents   int  NOT NULL DEFAULT 0 CHECK (cleaning_fee_cents >= 0),
  min_nights           int  NOT NULL DEFAULT 1 CHECK (min_nights >= 1),
  max_nights           int  NOT NULL DEFAULT 60 CHECK (max_nights >= min_nights),
  booking_mode         text NOT NULL DEFAULT 'request' CHECK (booking_mode IN ('instant', 'request')),
  cancellation_policy  text NOT NULL DEFAULT 'moderate' CHECK (cancellation_policy IN ('flexible', 'moderate', 'firm')),
  check_in_time        text NOT NULL DEFAULT '3:00 pm',
  check_out_time       text NOT NULL DEFAULT '11:00 am',
  amenities            text[] NOT NULL DEFAULT '{}',
  house_rules          text[] NOT NULL DEFAULT '{}',
  arrival_instructions text NOT NULL DEFAULT '',   -- shared with guests only after booking is confirmed
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden')),
  rating               numeric(3,2),
  review_count         int NOT NULL DEFAULT 0,
  ical_token           text NOT NULL DEFAULT encode(gen_random_bytes(18), 'hex'),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX properties_host_idx ON properties (host_id);
CREATE INDEX properties_status_idx ON properties (status);

CREATE TABLE photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  position     int  NOT NULL DEFAULT 0,
  caption      text NOT NULL DEFAULT '',
  large        bytea NOT NULL,
  thumb        bytea NOT NULL,
  width        int NOT NULL,
  height       int NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX photos_property_idx ON photos (property_id, position);

CREATE TABLE bookings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 text NOT NULL UNIQUE,
  property_id          uuid NOT NULL REFERENCES properties(id),
  guest_id             uuid NOT NULL REFERENCES users(id),
  check_in             date NOT NULL,
  check_out            date NOT NULL,
  guests               int  NOT NULL CHECK (guests >= 1),
  status               text NOT NULL CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled', 'expired')),
  nights               int  NOT NULL,
  nightly_price_cents  int  NOT NULL,
  cleaning_fee_cents   int  NOT NULL,
  tax_cents            int  NOT NULL,
  total_cents          int  NOT NULL,
  guest_name           text NOT NULL,
  guest_phone          text NOT NULL,
  arrival_time         text NOT NULL DEFAULT '',
  message              text NOT NULL DEFAULT '',
  host_note            text NOT NULL DEFAULT '',
  cancelled_by         text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in),
  -- The database itself refuses two active bookings for the same property on overlapping nights.
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    property_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
);
CREATE INDEX bookings_guest_idx ON bookings (guest_id);
CREATE INDEX bookings_property_idx ON bookings (property_id, check_in);

CREATE TABLE blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  note        text NOT NULL DEFAULT '',
  source      text NOT NULL DEFAULT 'host',   -- 'host' or 'ical:<feed id>'
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);
CREATE INDEX blocks_property_idx ON blocks (property_id, start_date);

CREATE TABLE ical_feeds (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name           text NOT NULL,
  url            text NOT NULL,
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid REFERENCES properties(id) ON DELETE SET NULL,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  name         text NOT NULL,
  email        text NOT NULL,
  topic        text NOT NULL DEFAULT '',
  body         text NOT NULL,
  handled      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE event_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  level       text NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  area        text NOT NULL,
  message     text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}',
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz
);
CREATE INDEX event_log_at_idx ON event_log (at DESC);

CREATE TABLE settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('tax_percent', '0'),
  ('contact_email', '"hello@sevgio.com"'),
  ('contact_phone', '""'),
  ('payment_note', '"No payment is taken online. Your host will contact you to arrange payment."'),
  ('site_notice', '""');

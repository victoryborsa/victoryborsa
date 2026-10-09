-- Double bookings: two reservations for the same home or room (or a whole house and one of its rooms) on the same nights,
-- or back-to-back stays with less turnover time than the listing needs. Found by lib/conflicts.ts after every calendar
-- refresh and reservation change. Nothing is ever cancelled automatically; a conflict stays listed until someone marks it resolved.
CREATE TABLE booking_conflicts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_key         text NOT NULL UNIQUE,                 -- the two reservations, e.g. "b:<booking id>|c:<channel reservation id>"
  kind             text NOT NULL CHECK (kind IN ('overlap', 'turnaround')),
  property_ids     uuid[] NOT NULL,                      -- the listing(s) involved, for host access and filters
  start_date       date NOT NULL,                        -- overlapping nights [start, end); for turnover: the changeover day
  end_date         date NOT NULL,
  gap_hours        numeric,                              -- turnover only: hours between check-out and the next check-in
  needed_hours     numeric,                              -- turnover only: hours the listing needs
  snapshot         jsonb NOT NULL DEFAULT '{}',          -- both reservations as last seen, so the alert still reads if one is later removed
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  cleared_at       timestamptz,                          -- no longer overlapping (one stay cancelled or moved) but not yet reviewed
  notified_at      timestamptz,
  email_result     text NOT NULL DEFAULT '',
  push_result      text NOT NULL DEFAULT '',
  resolved_at      timestamptz,
  resolved_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  resolution       text NOT NULL DEFAULT '',
  resolution_note  text NOT NULL DEFAULT ''
);
CREATE INDEX booking_conflicts_open_idx ON booking_conflicts (status, start_date);
CREATE INDEX booking_conflicts_props_idx ON booking_conflicts USING gin (property_ids);

-- Hours a listing needs between one guest's check-out and the next check-in (cleaning, inspection). 0 = only the check-in/out times.
ALTER TABLE properties ADD COLUMN turnaround_hours int NOT NULL DEFAULT 0 CHECK (turnaround_hours BETWEEN 0 AND 168);

-- Phones and computers that asked for instant alerts (web push).
CREATE TABLE push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  device          text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_error      text NOT NULL DEFAULT ''
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

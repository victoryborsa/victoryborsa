-- Reservations made on Airbnb, Vrbo, Booking.com and other sites, kept as real records (not just blocked dates),
-- so they show up in the calendar, the reservations list, statements and Finance.
-- Money columns are NULL until known: calendar links (iCal) carry dates only, so amounts come from manual entry or a payout CSV.
CREATE TABLE channel_reservations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id            uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  feed_id                uuid REFERENCES ical_feeds(id) ON DELETE SET NULL,
  channel                text NOT NULL DEFAULT 'other',      -- airbnb, vrbo, bookingcom, furnished, other
  kind                   text NOT NULL DEFAULT 'reservation' CHECK (kind IN ('reservation', 'blocked', 'unknown')),
  kind_locked            boolean NOT NULL DEFAULT false,      -- set by the host or an import; calendar sync won't change it
  status                 text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  source                 text NOT NULL DEFAULT 'ical' CHECK (source IN ('ical', 'manual', 'import')),
  ical_uid               text,
  external_ref           text NOT NULL DEFAULT '',            -- the site's confirmation code, e.g. HMABC12345
  check_in               date NOT NULL,
  check_out              date NOT NULL,
  summary                text NOT NULL DEFAULT '',
  guest_name             text NOT NULL DEFAULT '',
  guests                 int CHECK (guests IS NULL OR guests >= 1),
  rent_cents             int,
  cleaning_cents         int,
  other_cents            int,
  tax_cents              int,
  commission_cents       int,
  refund_cents           int,
  expected_payout_cents  int,
  received_payout_cents  int,
  payout_date            date,
  finance_source         text NOT NULL DEFAULT 'none' CHECK (finance_source IN ('none', 'manual', 'import')),
  note                   text NOT NULL DEFAULT '',
  first_seen_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at           timestamptz NOT NULL DEFAULT now(),
  modified_at            timestamptz,                          -- dates changed on the other site
  cancelled_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);
-- One row per event in a calendar link, so refreshing updates instead of duplicating.
CREATE UNIQUE INDEX channel_res_feed_uid_key ON channel_reservations (feed_id, ical_uid) WHERE feed_id IS NOT NULL AND ical_uid IS NOT NULL;
-- One row per confirmation code on each site.
CREATE UNIQUE INDEX channel_res_ref_key ON channel_reservations (channel, lower(external_ref)) WHERE external_ref <> '';
CREATE INDEX channel_res_property_idx ON channel_reservations (property_id, check_in);

-- Blocked or unclear dates on another site that only mirror a real reservation (a Sevgio booking sent out through
-- Sevgio's calendar link, a reservation on another site, or the linked whole home / room being booked) are not
-- counted again. Use this view, not the table, for the calendar and Finance.
CREATE VIEW channel_stays AS
SELECT c.*,
  CASE WHEN c.kind <> 'reservation' AND (
    EXISTS (SELECT 1 FROM bookings b, properties me
            WHERE me.id = c.property_id AND b.status IN ('pending', 'awaiting_payment', 'confirmed')
              AND b.property_id IN (SELECT r.id FROM properties r WHERE r.id = me.id OR r.parent_id = me.id OR r.id = me.parent_id)
              AND b.check_in < c.check_out AND b.check_out > c.check_in)
    OR EXISTS (SELECT 1 FROM channel_reservations o, properties me
               WHERE me.id = c.property_id AND o.id <> c.id AND o.kind = 'reservation' AND o.status = 'confirmed'
                 AND o.property_id IN (SELECT r.id FROM properties r WHERE r.id = me.id OR r.parent_id = me.id OR r.id = me.parent_id)
                 AND o.check_in <= c.check_in AND o.check_out >= c.check_out)
  ) THEN 'mirror' ELSE c.kind END AS eff_kind
FROM channel_reservations c;

-- Each payout file imported, for the history list on the import page.
CREATE TABLE channel_imports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  file_name   text NOT NULL DEFAULT '',
  channel     text NOT NULL,
  rows        int NOT NULL DEFAULT 0,
  updated     int NOT NULL DEFAULT 0,
  created     int NOT NULL DEFAULT 0,
  skipped     int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Carry over what earlier syncs stored as plain blocked dates; the next refresh attaches each one to its calendar event.
INSERT INTO channel_reservations (property_id, feed_id, channel, kind, check_in, check_out, summary)
SELECT k.property_id, f.id,
  CASE WHEN lower(f.name) LIKE '%airbnb%' THEN 'airbnb' WHEN lower(f.name) LIKE '%booking%' THEN 'bookingcom'
       WHEN lower(f.name) LIKE '%vrbo%' OR lower(f.name) LIKE '%homeaway%' THEN 'vrbo' WHEN lower(f.name) LIKE '%furnished%' THEN 'furnished' ELSE 'other' END,
  CASE WHEN k.note ~* '(not available|blocked|unavailable)' AND k.note !~* 'reserv' THEN 'blocked'
       WHEN k.note ~* 'closed' THEN 'unknown' ELSE 'reservation' END,
  k.start_date, k.end_date, trim(regexp_replace(k.note, '^[^:]*:', ''))
FROM blocks k JOIN ical_feeds f ON k.source = 'ical:' || f.id::text;

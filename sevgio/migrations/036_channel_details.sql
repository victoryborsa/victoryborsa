-- What each site's calendar link actually sent for a stay, so the host can see whether a missing reference or guest name
-- is missing at the source or just not shown; the last 4 digits of the guest's phone (Airbnb sends these);
-- and where the booking reference came from, so a reference typed in by a host or admin is never replaced by a sync.
ALTER TABLE channel_reservations ADD COLUMN feed_detail text NOT NULL DEFAULT '';
ALTER TABLE channel_reservations ADD COLUMN phone_last4 text NOT NULL DEFAULT '';
ALTER TABLE channel_reservations ADD COLUMN ref_source text NOT NULL DEFAULT ''
  CHECK (ref_source IN ('', 'feed', 'import', 'manual'));
UPDATE channel_reservations SET ref_source = CASE WHEN external_ref = '' THEN '' WHEN source = 'ical' THEN 'feed' WHEN source = 'import' THEN 'import' ELSE 'manual' END;

DROP VIEW channel_stays;
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

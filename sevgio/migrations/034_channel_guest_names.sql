-- Where a reservation's guest name came from, so a calendar refresh never replaces a name typed in by a host or admin.
-- '' = no name yet, 'feed' = the site's calendar link, 'import' = a payout or reservations file, 'manual' = typed in on Sevgio.
ALTER TABLE channel_reservations ADD COLUMN guest_name_source text NOT NULL DEFAULT ''
  CHECK (guest_name_source IN ('', 'feed', 'import', 'manual'));
ALTER TABLE channel_reservations ADD COLUMN guest_name_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE channel_reservations ADD COLUMN guest_name_at timestamptz;

UPDATE channel_reservations SET guest_name_source = CASE
  WHEN guest_name = '' THEN ''
  WHEN source = 'ical' AND position(lower(guest_name) IN lower(summary)) > 0 THEN 'feed'
  WHEN source = 'import' OR finance_source = 'import' THEN 'import'
  ELSE 'manual' END;

-- For the guest name and reference search box on Bookings.
CREATE INDEX channel_res_guest_idx ON channel_reservations (lower(guest_name)) WHERE guest_name <> '';

-- The view lists the table's columns as they were when it was made, so remake it to include the new ones.
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

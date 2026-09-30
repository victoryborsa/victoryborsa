-- When a host or admin first saw a booking in their dashboard (NULL = new, show an alert).
ALTER TABLE bookings ADD COLUMN seen_at timestamptz;
UPDATE bookings SET seen_at = now() WHERE created_at < now() - interval '7 days';
CREATE INDEX bookings_unseen_idx ON bookings (property_id) WHERE seen_at IS NULL;

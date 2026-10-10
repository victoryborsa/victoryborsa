-- Rollback for 043_operations_and_outbox.sql. EMERGENCY USE ONLY, after taking a backup (see docs/backup-and-restore.md).
-- Refunded bookings go back to "paid" (the money record is kept); waiting emails are dropped; error stages are removed.
UPDATE bookings SET payment_status = 'paid' WHERE payment_status = 'refunded';
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('none', 'pending', 'processing', 'paid', 'deposit_paid', 'failed'));
ALTER TABLE bookings DROP COLUMN IF EXISTS checkin_email_at;
DROP TABLE IF EXISTS email_outbox;
DROP INDEX IF EXISTS event_log_open_idx;
ALTER TABLE event_log DROP COLUMN IF EXISTS stage_note, DROP COLUMN IF EXISTS stage_by, DROP COLUMN IF EXISTS stage_at, DROP COLUMN IF EXISTS stage;

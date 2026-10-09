-- Rollback for 046_corporate_reservations.sql. EMERGENCY USE ONLY, after taking a backup (see docs/backup-and-restore.md).
-- Bookings paid by Cash App are moved to Venmo first so the old payment-method rule can be put back.
DROP TABLE IF EXISTS ical_fetches;
UPDATE bookings SET payment_method = 'venmo' WHERE payment_method = 'cashapp';
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_method_check CHECK (payment_method IN ('card', 'ach', 'zelle', 'venmo', 'cash'));
ALTER TABLE bookings DROP COLUMN IF EXISTS fixed_price, DROP COLUMN IF EXISTS deposit_due_cents, DROP COLUMN IF EXISTS payment_due_date, DROP COLUMN IF EXISTS card_fee_flat_cents;
DELETE FROM settings WHERE key IN ('cashapp_handle', 'corporate_card_fee_cents');

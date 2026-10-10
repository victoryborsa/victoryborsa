-- A booking's reference (bookings.code) is given once, when the booking is made, and never changes:
-- confirmations, invoices, payment notes and admin records all quote it, including after changes or a cancellation.
CREATE OR REPLACE FUNCTION keep_booking_code() RETURNS trigger AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'A booking reference cannot be changed (booking %)', OLD.code USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_code_locked ON bookings;
CREATE TRIGGER bookings_code_locked BEFORE UPDATE OF code ON bookings FOR EACH ROW EXECUTE FUNCTION keep_booking_code();

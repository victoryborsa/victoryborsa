-- Payments: card / bank transfer through Stripe, or Zelle / Venmo / cash-at-arrival marked received by the host.
ALTER TABLE bookings DROP CONSTRAINT bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending', 'awaiting_payment', 'confirmed', 'declined', 'cancelled', 'expired'));

-- Dates waiting for payment are held too.
ALTER TABLE bookings DROP CONSTRAINT bookings_no_overlap;
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
  property_id WITH =,
  daterange(check_in, check_out, '[)') WITH &&
) WHERE (status IN ('pending', 'awaiting_payment', 'confirmed'));

ALTER TABLE bookings
  ADD COLUMN payment_method text CHECK (payment_method IN ('card', 'ach', 'zelle', 'venmo', 'cash')),
  ADD COLUMN card_fee_cents int NOT NULL DEFAULT 0,
  ADD COLUMN due_now_cents int NOT NULL DEFAULT 0,       -- full amount, or the deposit for cash at arrival
  ADD COLUMN paid_cents int NOT NULL DEFAULT 0,
  ADD COLUMN payment_status text NOT NULL DEFAULT 'none' CHECK (payment_status IN ('none', 'pending', 'processing', 'paid', 'deposit_paid', 'failed')),
  ADD COLUMN payment_deadline timestamptz;

CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  method          text NOT NULL,
  amount_cents    int NOT NULL,
  status          text NOT NULL CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  stripe_session  text UNIQUE,
  stripe_intent   text,
  recorded_by     uuid REFERENCES users(id),
  note            text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_booking_idx ON payments (booking_id);

INSERT INTO settings (key, value) VALUES
  ('pay_card', 'false'), ('pay_ach', 'false'), ('pay_zelle', 'false'), ('pay_venmo', 'false'), ('pay_cash', 'false'),
  ('card_fee_percent', '2.9'), ('card_fee_fixed_cents', '30'),
  ('zelle_to', '""'), ('venmo_handle', '""'),
  ('deposit_percent', '30'), ('manual_payment_hours', '24')
ON CONFLICT (key) DO NOTHING;

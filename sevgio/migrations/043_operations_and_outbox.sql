-- Operations log workflow, email retries and refunds.

-- Errors move through New → Investigating → Fix Deployed → Verified → Resolved instead of a single "Mark resolved".
-- resolved_at stays in step with the Resolved stage, so older queries keep working.
ALTER TABLE event_log
  ADD COLUMN stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'investigating', 'fix_deployed', 'verified', 'resolved')),
  ADD COLUMN stage_at timestamptz,
  ADD COLUMN stage_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN stage_note text NOT NULL DEFAULT '';
UPDATE event_log SET stage = 'resolved', stage_at = resolved_at WHERE resolved_at IS NOT NULL;
CREATE INDEX event_log_open_idx ON event_log (level, stage) WHERE stage <> 'resolved';

-- Emails that could not be sent wait here and are tried again automatically.
CREATE TABLE email_outbox (
  id           bigserial PRIMARY KEY,
  to_addr      text NOT NULL,
  subject      text NOT NULL,
  body         text NOT NULL,
  status       text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'sent', 'failed')),
  attempts     int NOT NULL DEFAULT 1,
  last_error   text NOT NULL DEFAULT '',
  next_try_at  timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz
);
CREATE INDEX email_outbox_due_idx ON email_outbox (next_try_at) WHERE status = 'waiting';

-- A cancelled booking whose money was returned.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('none', 'pending', 'processing', 'paid', 'deposit_paid', 'failed', 'refunded'));

-- When the check-in instructions email went out (sent automatically two days before arrival).
ALTER TABLE bookings ADD COLUMN checkin_email_at timestamptz;

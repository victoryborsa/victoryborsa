-- Guest messaging for Sevgio.com bookings: one conversation per reservation, between the guest and the host / admins.
-- `read_at` is set when the other side opens the conversation. `email_status` records what the mail server told us about
-- the email notice for this message ('sent' only means the mail server accepted it, not that it reached the inbox).
CREATE TABLE booking_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  from_guest   boolean NOT NULL,
  body         text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  client_id    text,
  email_status text NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'queued', 'failed', 'off')),
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_messages_booking_idx ON booking_messages (booking_id, created_at);
-- Pressing Send twice (or a retry after a dropped connection) never saves the same message twice.
CREATE UNIQUE INDEX booking_messages_client_key ON booking_messages (booking_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX booking_messages_unread_idx ON booking_messages (booking_id) WHERE read_at IS NULL;

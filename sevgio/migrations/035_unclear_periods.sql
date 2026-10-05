-- Vrbo labels reservations "Blocked" as well as owner holds, and older syncs stored Booking.com's "CLOSED - Not available"
-- as blocked dates, so those reservations never reached the reservation lists. Periods from a calendar link that the
-- host hasn't sorted are now "unknown" (shown as "Needs check") unless the site clearly says there is no guest.
-- The next calendar refresh applies the same rule (lib/channels.ts classifyEvent).
UPDATE channel_reservations SET kind = 'unknown', updated_at = now()
WHERE kind = 'blocked' AND NOT kind_locked AND source = 'ical'
  AND summary !~* '\m(owner|maintenance|repairs?|cleaning)\M'
  AND NOT (channel = 'airbnb' AND summary ~* '(not available|unavailable|blocked)');

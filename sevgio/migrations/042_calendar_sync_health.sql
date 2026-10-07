-- Calendar sync health: when each calendar link was last tried, what the last successful sync changed,
-- how many tries in a row have failed, and when admins were alerted about it.
ALTER TABLE ical_feeds
  ADD COLUMN last_attempt_at timestamptz,
  ADD COLUMN fail_count      int NOT NULL DEFAULT 0,
  ADD COLUMN last_result     jsonb NOT NULL DEFAULT '{}',   -- {events, added, updated, changed, cancelled} from the last successful sync
  ADD COLUMN alerted_at      timestamptz;                   -- admins told it keeps failing; cleared on the next success
UPDATE ical_feeds SET last_attempt_at = last_synced_at, fail_count = CASE WHEN last_error IS NOT NULL AND last_synced_at IS NULL THEN 1 ELSE 0 END;

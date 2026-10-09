-- Rollback for 042_calendar_sync_health.sql. EMERGENCY USE ONLY, after taking a backup (see docs/backup-and-restore.md).
-- Removes the sync health columns; calendar links and reservations are not touched.
ALTER TABLE ical_feeds
  DROP COLUMN IF EXISTS alerted_at,
  DROP COLUMN IF EXISTS last_result,
  DROP COLUMN IF EXISTS fail_count,
  DROP COLUMN IF EXISTS last_attempt_at;

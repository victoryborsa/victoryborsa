-- Rollback for 040_booking_conflicts.sql. EMERGENCY USE ONLY, after taking a backup (see docs/backup-and-restore.md).
-- Removes the double-booking list, turnover hours and push-alert devices. The website code that uses them must be
-- rolled back first, or those pages will fail.
DROP TABLE IF EXISTS push_subscriptions;
ALTER TABLE properties DROP COLUMN IF EXISTS turnaround_hours;
DROP TABLE IF EXISTS booking_conflicts;

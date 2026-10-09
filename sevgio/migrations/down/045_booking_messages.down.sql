-- Rollback for 045_booking_messages.sql. EMERGENCY USE ONLY, after taking a backup (see docs/backup-and-restore.md). Deletes every guest message.
DROP TABLE IF EXISTS booking_messages;

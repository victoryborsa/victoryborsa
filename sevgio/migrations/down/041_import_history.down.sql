-- Rollback for 041_import_history.sql. EMERGENCY USE ONLY, after taking a backup (see docs/backup-and-restore.md).
-- Removes import history details, undo backups and the "Import that did not finish" entries this migration created.
-- No reservation is touched. The website code that uses import history must be rolled back first.
DELETE FROM channel_imports WHERE legacy AND status = 'running' AND file_name = 'Import that did not finish';
DROP TABLE IF EXISTS channel_import_backups;
DROP TABLE IF EXISTS channel_import_changes;
ALTER TABLE channel_imports
  DROP COLUMN IF EXISTS undo_note,
  DROP COLUMN IF EXISTS undone_by,
  DROP COLUMN IF EXISTS undone_at,
  DROP COLUMN IF EXISTS legacy,
  DROP COLUMN IF EXISTS status;

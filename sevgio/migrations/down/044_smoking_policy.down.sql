-- Rollback for 044_smoking_policy.sql. EMERGENCY USE ONLY, after taking a backup (see docs/backup-and-restore.md).
ALTER TABLE properties DROP COLUMN IF EXISTS smoking;

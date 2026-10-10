-- Import history with undo. Each reservations/payout file import now records exactly which reservations it added
-- and, for the ones it changed, their values before and after, so one import can be reversed without touching
-- anything else. Undo copies every affected row (and its blocked nights) to channel_import_backups first.
ALTER TABLE channel_imports
  ADD COLUMN status      text NOT NULL DEFAULT 'done' CHECK (status IN ('running', 'done', 'undone')),
  ADD COLUMN legacy      boolean NOT NULL DEFAULT false,   -- made before this history existed; its rows were matched by time
  ADD COLUMN undone_at   timestamptz,
  ADD COLUMN undone_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN undo_note   text NOT NULL DEFAULT '';

CREATE TABLE channel_import_changes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id       uuid NOT NULL REFERENCES channel_imports(id) ON DELETE CASCADE,
  reservation_id  uuid NOT NULL,                 -- no foreign key: the reservation may since have been removed
  action          text NOT NULL CHECK (action IN ('create', 'update')),
  before          jsonb,                         -- fields the import changed, as they were (null for legacy imports)
  after           jsonb,                         -- the same fields right after the import
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_id, reservation_id)
);
CREATE INDEX channel_import_changes_res_idx ON channel_import_changes (reservation_id);

-- Full copies taken just before an undo, so the undo itself can be reversed ("Put it back").
CREATE TABLE channel_import_backups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id       uuid NOT NULL REFERENCES channel_imports(id) ON DELETE CASCADE,
  reservation_id  uuid NOT NULL,
  action          text NOT NULL,
  row             jsonb NOT NULL,
  blocks          jsonb NOT NULL DEFAULT '[]',
  taken_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX channel_import_backups_import_idx ON channel_import_backups (import_id);

-- Earlier imports: the summary row was written right after the import finished, so each reservation an import
-- added (source 'import') belongs to the first import of the same site saved at or after it, within 30 minutes.
UPDATE channel_imports SET legacy = true;
INSERT INTO channel_import_changes (import_id, reservation_id, action, created_at)
SELECT DISTINCT ON (c.id) i.id, c.id, 'create', c.created_at
FROM channel_reservations c
JOIN channel_imports i ON i.legacy AND i.channel = c.channel AND i.created_at >= c.created_at AND i.created_at < c.created_at + interval '30 minutes'
WHERE c.source = 'import' AND NOT EXISTS (SELECT 1 FROM channel_import_changes x WHERE x.reservation_id = c.id)
ORDER BY c.id, i.created_at
ON CONFLICT DO NOTHING;

-- Reservations an earlier import changed (amounts saved from a file) and nothing touched since.
INSERT INTO channel_import_changes (import_id, reservation_id, action, created_at)
SELECT DISTINCT ON (c.id) i.id, c.id, 'update', c.updated_at
FROM channel_reservations c
JOIN channel_imports i ON i.legacy AND i.channel = c.channel AND i.created_at >= c.updated_at AND i.created_at < c.updated_at + interval '30 minutes'
WHERE c.source <> 'import' AND c.finance_source = 'import' AND NOT EXISTS (SELECT 1 FROM channel_import_changes x WHERE x.reservation_id = c.id AND x.import_id = i.id)
ORDER BY c.id, i.created_at
ON CONFLICT DO NOTHING;

-- Reservations added by an import that stopped before saving its summary (a timeout on a large file) belong to no
-- import above. Group them by site and hour into an entry marked as not finished, so they can be reviewed and undone too.
WITH orphans AS (
  SELECT c.id, c.channel, date_trunc('hour', c.created_at) AS hr, c.created_at FROM channel_reservations c
  WHERE c.source = 'import' AND NOT EXISTS (SELECT 1 FROM channel_import_changes x WHERE x.reservation_id = c.id)
), batches AS (
  INSERT INTO channel_imports (file_name, channel, rows, created, created_at, status, legacy)
  SELECT 'Import that did not finish', channel, count(*), count(*), max(created_at), 'running', true FROM orphans GROUP BY channel, hr
  RETURNING id, channel, created_at
)
INSERT INTO channel_import_changes (import_id, reservation_id, action, created_at)
SELECT b.id, o.id, 'create', o.created_at FROM orphans o JOIN batches b ON b.channel = o.channel AND date_trunc('hour', b.created_at) = o.hr;

# Rollback files

Every database change from `040` on has a matching rollback here: `migrations/NNN_name.sql` → `migrations/down/NNN_name.down.sql`.
A unit test (`tests/unit/migrations.test.ts`) fails if a new migration is added without one.

Rollbacks are for emergencies only. They undo a change after the matching website code has been rolled back.
Always take a backup first (`docs/backup-and-restore.md` at the top of the repository).

Run one, newest first:

```
DATABASE_URL=... npm run migrate:down -- 041_import_history.sql
```

It only runs the newest applied migration (so changes are undone in order), inside one transaction, and removes it from
`schema_migrations` so `npm run migrate` would apply it again.

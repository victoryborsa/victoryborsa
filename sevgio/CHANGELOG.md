# Changelog

Each module of the Sevgio PMS upgrade adds an entry here. Nothing existing is removed or renamed; every new feature has an on/off switch in **Admin → Feature switches**.

## 2026-10-07 — Phase 1, module 1: backups guide, feature switches, database undo files

**What changed**
- New page **Admin → Feature switches** (`/admin/features`). It lists every upgrade feature with its switch. Features show "Not built yet" until they're ready, and can't be switched on before then. Turning a switch on or off is recorded in Errors & activity. A Render setting with the same name (for example `FEATURE_AUDIT_LOG=off`) overrides the switch in an emergency.
- Database changes now come with undo files: `migrations/down/NNN_name.down.sql`, run with `npm run migrate:down -- NNN_name.sql` (newest first, one transaction). Undo files were written for the two newest changes (040 double bookings, 041 import history). A test fails if a future change is added without one.
- Plain-English backup and restore guide: `docs/backup-and-restore.md` at the top of the repository.

**What stayed the same**
- Everything. No database change, no change to any existing page, booking, payment, calendar or import.

**Files added:** `lib/flag-list.ts`, `lib/flags.ts`, `app/admin/features/page.tsx`, `migrations/down/040_booking_conflicts.down.sql`, `migrations/down/041_import_history.down.sql`, `migrations/down/README.md`, `scripts/migrate-down.mjs`, `tests/unit/migrations.test.ts`, `tests/e2e/features.spec.ts`, `docs/backup-and-restore.md`, `CHANGELOG.md`.
**Files edited:** `app/actions/admin.ts` (new `setFlagAction`), `app/admin/layout.tsx` (menu link), `package.json` (`migrate:down` script).

**Database migration:** none. Switches are saved in the existing `settings` table as `flag:FEATURE_…`.
**New environment variables:** none required. Optional emergency overrides: `FEATURE_<NAME>=on|off`.

**Check that nothing old broke**
1. Admin → Settings still opens and saves.
2. Admin → Feature switches opens and lists the features as "Not built yet".
3. Make a test booking, open the calendar and Double bookings: all as before.

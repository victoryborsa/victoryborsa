# Changelog

Changes to the Sevgio site, newest first. Nothing existing is removed or renamed.

## 2026-10-07 — Add Manual Reservation

**What changed**
- **+ Add Manual Reservation** button on Admin → Dashboard, Bookings and Calendar. It opens `/admin/bookings/new`: property, guest name, email, phone, check-in, check-out, then **Save Reservation**.
- Before saving it checks the property (and its whole house or rooms) for existing bookings and blocked nights, inside the same lock and database constraint as website bookings, so it can't double-book.
- The reservation is **confirmed with $0 paid**, priced from the property's normal rates, and shows on the calendar right away. It is marked "Pay at the property", shows the **Amount due**, and never expires for non-payment. Payments are recorded later with **Mark payment received** on the reservation page.
- The guest is emailed a confirmation with the total, amount paid, balance due and "Payment is due at the property unless otherwise arranged." If the email address is new, a guest account is created so they can see the booking online (first time via "Forgot password").
- Fixed the "a.modified_at.slice is not a function" error on Host → Bookings → Other sites.
- Feature switches page removed from the admin menu (still at `/admin/features` address for later); manual reservations need no switch.

**What stayed the same:** website booking, payments, calendar sync and every other page. No database change.

**Files added:** `app/admin/bookings/new/page.tsx`, `tests/e2e/manual-reservation.spec.ts`, `tests/unit/manual-booking.test.ts`.
**Files edited:** `lib/bookings.ts` (`createManualBooking`), `lib/payment-flow.ts` (`emailManualConfirmation`), `lib/payment-rules.ts` (`paysAtProperty`, `methodLabel`), `lib/booking-ref.ts` (unpaid label), `lib/dates.ts` (`todayLocal` takes an optional date), `app/actions/host.ts` (`addManualReservationAction`), `app/admin/page.tsx`, `app/admin/bookings/page.tsx`, `app/admin/calendar/page.tsx`, `app/admin/bookings/[code]/page.tsx`, `app/trips/[code]/invoice/page.tsx`, `app/host/bookings/other-sites/page.tsx`, `app/admin/layout.tsx`, `components/Flash.tsx`, `lib/flag-list.ts`.

**Check:** Admin → Bookings → + Add Manual Reservation → fill in → Save. The reservation page opens, the dates are blocked on the calendar, and the guest gets the email. Saving overlapping dates again shows "already booked".

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

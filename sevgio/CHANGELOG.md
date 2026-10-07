# Changelog

Changes to the Sevgio site, newest first. Nothing existing is removed or renamed.

## 2026-10-07 — Fix list: statuses, payments, Operations log, editing, listing facts, SEO, legal pages

**What changed**
- **Reservation statuses** are one set everywhere: Confirmed, Pending, External Calendar Block, Needs Review, Cancelled, Checked In, Checked Out. "Unconfirmed" is gone; calendar-only events say **External Calendar Block**, overlapping stays say **Needs Review**. Missing names and references say what's missing ("Name not sent by Airbnb") instead of inventing anything.
- **Payment status** is separate: Unpaid, Partially Paid, Paid, Refunded, Payment unavailable. Admins can **Mark refunded**. Confirmation emails and pages say "Payment due at property" or "Host will contact you regarding payment".
- **Dates**: every timestamp on every page goes through one safe formatter, so a date stored as text or as a date can't break a page again.
- **Edit reservation** on Admin → Bookings → a reservation: dates, name, phone, guests and total. New dates are checked against every booking and blocked night; the price follows the nights at the agreed rate; the guest can be emailed what changed.
- **Calendar sync**: a stay typed in by hand is linked to the calendar event when it arrives instead of being added twice.
- **Emails**: failed emails wait in an outbox and are retried (10 min, 30 min, 2 h, 6 h, 24 h); Operations log shows the outbox with Retry/Resend. Payment receipts and check-in instructions (0–2 days before arrival) are sent once each.
- **Operations log** (was "Errors & activity"): each error shows time, version, area, message, stack trace, route, related reservation, property and platform, and moves New → Investigating → Fix Deployed → Verified → Resolved. Passwords, card numbers, keys and door codes are removed before saving.
- **Listings**: one master set of rules (pets, smoking, cameras, parking, check-in/out, guests, deposit). Description or house-rule lines that contradict a setting are hidden from guests and listed in a **Listing check** box on the listing editor. New **Smoking** setting. Cameras are described once. Zero counts in listing activity are hidden. The "New" badge shows for 45 days.
- **Booking page** shows the house rules summary before "I agree".
- **Corporate housing** "Available" dates come from the real calendar.
- **Contact page** has optional reservation number, phone, property and check-in date.
- **SEO**: page titles, descriptions, canonical links, structured data (business and each listing), alt text on listing and event photos; sign-in pages are not indexed.
- **Legal pages**: Privacy, Terms, Cancellation policy, Accessibility, Host terms, linked under "Policies" in the footer and in the sitemap.
- "Sevgio" is the only brand name used.

**Database:** `043_operations_and_outbox` (error stages, email outbox, refunded payment status, check-in email time) and `044_smoking_policy` (smoking setting; listings whose rules say "smoking outside" get "Outside only"). No reservation records are rewritten. Undo files are in `migrations/down/`.

**Check:** run the production checklist in `fix-list/status.md`.

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

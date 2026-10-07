// Every feature added by the PMS upgrade is listed here with an on/off switch (Admin → Feature switches).
// A switch only appears as usable once its feature is built ("ready"); until then it shows as coming soon.
// Switches are saved in the settings table, so they change without a deploy. A Render setting with the same
// name (FEATURE_X=on or off) overrides the switch, for emergencies.

export type FlagDef = { key: string; name: string; about: string; phase: 1 | 2 | 3; ready: boolean };

export const FLAGS: FlagDef[] = [
  { key: "FEATURE_AUDIT_LOG", phase: 1, ready: false, name: "Change history (audit log)", about: "Records who changed what on reservations, guests, listings, prices and payments, with the before and after values." },
  { key: "FEATURE_RESERVATION_SERVICE", phase: 1, ready: false, name: "Shared booking engine", about: "Every reservation (website, calendar link, CSV import, typed in) goes through the same duplicate and double-booking checks." },
  { key: "FEATURE_MANUAL_RESERVATIONS", phase: 1, ready: false, name: "Manual reservations (payment optional)", about: "Create a confirmed booking for a guest who calls, with $0 paid, and record payment later." },
  { key: "FEATURE_SOFT_DELETE", phase: 1, ready: false, name: "Restore deleted reservations", about: "Deleted reservations go to a 90-day restore list instead of being erased." },
  { key: "FEATURE_DUPLICATE_CHECK", phase: 1, ready: false, name: "Possible duplicate warnings", about: "Flags stays on the same listing and dates with a similar guest name for you to review." },
  { key: "FEATURE_IMPORT_DRY_RUN", phase: 1, ready: false, name: "Import preview and same-file check", about: "Shows what an import will add, change, skip or clash with before anything is saved, and refuses a file already imported." },
  { key: "FEATURE_ICAL_10MIN", phase: 1, ready: false, name: "Calendar links every 10 minutes", about: "Refreshes Airbnb, Booking.com and Vrbo calendars every 10 minutes instead of hourly, with a sync history." },
  { key: "FEATURE_NOTIFICATION_BELL", phase: 1, ready: false, name: "Notification bell", about: "One place in the admin for new bookings, changes, cancellations, double bookings and failures." },
  { key: "FEATURE_SYSTEM_HEALTH", phase: 1, ready: false, name: "System Health page", about: "Green, yellow or red for calendar links, email, database, backups and jobs." },
  { key: "FEATURE_ADMIN_12H_SESSIONS", phase: 2, ready: false, name: "12-hour admin sign-in", about: "Signs staff out after 12 hours instead of 30 days." },
  { key: "FEATURE_GV_INBOX", phase: 2, ready: false, name: "Google Voice texts in Sevgio", about: "Guest texts forwarded by Google Voice to Gmail appear on the reservation, with a Messages to Send Today list." },
];

export const flagKeys = new Set(FLAGS.map(f => f.key));

/** A Render setting overrides the saved switch: "on"/"true"/"1" or "off"/"false"/"0". Anything else is ignored. */
export function envOverride(raw: string | undefined): boolean | null {
  const v = (raw || "").trim().toLowerCase();
  if (["on", "true", "1", "yes"].includes(v)) return true;
  if (["off", "false", "0", "no"].includes(v)) return false;
  return null;
}

import "server-only";
import { one, q } from "./db.ts";
import { syncFeed } from "./calendar-sync.ts";
import { expireStaleRequests } from "./bookings.ts";
import { syncAllEvents } from "./events.ts";
import { logEvent } from "./log.ts";
import { runListingFeeJobs } from "./listing-fee.ts";
import { geocodeMissing } from "./geocode.ts";
import { checkConflicts } from "./conflicts.ts";

/** Hourly housekeeping: expire unpaid/unanswered requests, remove unconfirmed sign-ups, refresh Airbnb/Booking.com calendars and events. */
export async function runScheduledJobs() {
  const expired = await expireStaleRequests();
  // Guest accounts never confirmed within 7 days (and with no bookings) are removed, so fake sign-ups don't pile up.
  const removed = await q("DELETE FROM users WHERE role = 'customer' AND email_verified_at IS NULL AND created_at < now() - interval '7 days' AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.guest_id = users.id) RETURNING id");
  const feeds = await q<{ id: string }>("SELECT id FROM ical_feeds ORDER BY last_synced_at NULLS FIRST LIMIT 200");
  let ok = 0, failed = 0;
  for (const f of feeds) (await syncFeed(f.id, { checkAfter: false })).error ? failed++ : ok++;
  // One double-booking check after every calendar is fresh (also catches Sevgio bookings that changed in between).
  const conflicts = await checkConflicts();
  const events = await syncAllEvents();
  const listingFees = await runListingFeeJobs();
  const mapped = await geocodeMissing();
  return { conflicts, listingFees, mapped, feeds: feeds.length, ok, failed, expiredRequests: expired.length, removedUnconfirmedAccounts: removed.length, events };
}

let lastCheck = 0;

/** Runs the hourly jobs in the background when the site is visited, so no outside scheduler is needed.
 *  Only one server process wins each hour (claimed in the database). */
export async function maybeRunScheduledJobs() {
  if (process.env.BACKGROUND_JOBS === "off") return;
  if (Date.now() - lastCheck < 5 * 60_000) return;
  lastCheck = Date.now();
  try {
    const now = Date.now();
    const claimed = await one<{ key: string }>(
      `INSERT INTO settings (key, value) VALUES ('jobs_last_run', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE (settings.value #>> '{}')::bigint < $2
       RETURNING key`,
      [JSON.stringify(now), now - 60 * 60_000],
    );
    if (claimed) await runScheduledJobs();
  } catch (e) {
    await logEvent("error", "Scheduled jobs", "Background update failed", { error: String(e) });
  }
}

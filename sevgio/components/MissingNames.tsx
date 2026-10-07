import Link from "next/link";
import { q } from "@/lib/db.ts";
import { channelLabel } from "@/lib/channels.ts";
import { Icon } from "./Icon.tsx";

/**
 * A notice at the top of Bookings when upcoming reservations from other sites have no guest name, with the two ways to fix it:
 * import the sites' reservations download (fills them all at once), or Add details on each row.
 * `propertyIds` limits it to a host's listings; admins pass null.
 */
export async function MissingNames({ propertyIds, today }: { propertyIds: string[] | null; today: string }) {
  const rows = await q<{ channel: string; n: number }>(
    `SELECT channel, count(*)::int AS n FROM channel_stays
     WHERE status = 'confirmed' AND eff_kind = 'reservation' AND guest_name = '' AND check_out >= $1 AND ($2::uuid[] IS NULL OR property_id = ANY($2))
     GROUP BY channel ORDER BY count(*) DESC`, [today, propertyIds]);
  const total = rows.reduce((t, r) => t + r.n, 0);
  if (!total) return null;
  return (
    <aside className="notice mn" role="status" aria-labelledby="mn-h">
      <Icon name="info" size={20} />
      <div>
        <h3 id="mn-h" className="mn-h">{total} upcoming reservation{total === 1 ? " has" : "s have"} no guest name</h3>
        <p className="mn-p">{rows.map(r => `${r.n} from ${channelLabel(r.channel)}`).join(" · ")}. Airbnb, Booking.com and Vrbo calendar links never send guest names, so they have to come from the site&apos;s reservations download or be typed in.</p>
        <div className="mn-actions">
          <Link className="btn btn-primary btn-sm" href="/host/finance/import">Import a reservations file</Link>
          <span className="hint">Fills in every name at once (steps on that page). Or use <b>Add details</b> on a row to type one in.</span>
        </div>
      </div>
    </aside>
  );
}

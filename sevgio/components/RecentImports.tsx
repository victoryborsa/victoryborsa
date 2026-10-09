import Link from "next/link";
import { q } from "@/lib/db.ts";
import { channelLabel } from "@/lib/channels.ts";
import { Icon } from "./Icon.tsx";
import { fmtWhen, type Instant } from "@/lib/dates.ts";

/**
 * A notice at the top of Bookings for files imported in the last two days that added or changed reservations,
 * so a bad import can be found and undone from where its effects show up. Hosts see their own imports; admins pass null.
 */
export async function RecentImports({ userId }: { userId: string | null }) {
  const rows = await q<{ id: string; channel: string; file_name: string; created: number; updated: number; created_at: string }>(
    `SELECT id, channel, file_name, created, updated, created_at FROM channel_imports
     WHERE status <> 'undone' AND (created > 0 OR updated > 0) AND created_at > now() - interval '2 days' AND ($1::uuid IS NULL OR user_id = $1)
     ORDER BY created_at DESC LIMIT 4`, [userId]);
  if (!rows.length) return null;
  const when = (t: Instant) => fmtWhen(t);
  return (
    <aside className="notice mn" role="status" aria-labelledby="ri-h">
      <Icon name="info" size={20} />
      <div>
        <h3 id="ri-h" className="mn-h">Recent file imports</h3>
        <ul className="ri-list">{rows.map(r => (
          <li key={r.id}>{channelLabel(r.channel)} file {r.file_name} on {when(r.created_at)}: {r.created} added, {r.updated} changed. <Link href={`/host/finance/import/${r.id}`}>Review or undo</Link></li>
        ))}</ul>
      </div>
    </aside>
  );
}

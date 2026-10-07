import { q } from "./db.ts";
import type { Ev } from "@/components/EventTable.tsx";

/** Operations log rows with what they relate to (reservation reference, property) and how often the same error happened. */
export function opsEvents(where: string, params: unknown[], limit = 400) {
  return q<Ev>(
    `SELECT e.*, u.email, sb.email AS stage_by_email, coalesce(bk.code, CASE WHEN e.details->>'booking' LIKE 'SV-%' THEN e.details->>'booking' END) AS booking_code,
            pr.title AS property_title,
            count(*) OVER (PARTITION BY e.level, e.area, e.message)::int AS seen
     FROM event_log e
     LEFT JOIN users u ON u.id = e.user_id
     LEFT JOIN users sb ON sb.id = e.stage_by
     LEFT JOIN bookings bk ON bk.id::text = e.details->>'booking'
     LEFT JOIN properties pr ON pr.id::text = coalesce(e.details->>'property', bk.property_id::text)
     WHERE ${where} ORDER BY e.at DESC LIMIT ${Number(limit)}`, params);
}

export type OutboxRow = { id: number; to_addr: string; subject: string; status: string; attempts: number; last_error: string; next_try_at: string; created_at: string; sent_at: string | null };
export const outbox = () => q<OutboxRow>("SELECT id, to_addr, subject, status, attempts, last_error, next_try_at, created_at, sent_at FROM email_outbox WHERE status <> 'sent' OR sent_at > now() - interval '3 days' ORDER BY id DESC LIMIT 50");

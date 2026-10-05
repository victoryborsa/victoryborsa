import { one, q, tx, type Db } from "./db.ts";
import { lockProperty, replaceFeedBlocks } from "./bookings.ts";
import { classifyEvent, phoneLast4 } from "./channels.ts";
import type { IcsEvent } from "./ical.ts";

type Existing = { id: string; ical_uid: string | null; check_in: string; check_out: string; status: string; kind: string; kind_locked: boolean; external_ref: string; guest_name: string; guest_name_source: string };

export type FeedResult = { added: number; updated: number; changed: number; cancelled: number; unchanged: number; clashes: string[]; kept?: string };

/**
 * Brings one calendar link's reservations up to date. Each event is matched to the row it created before
 * (by its calendar ID, or by its dates for rows carried over from older syncs), so refreshing never duplicates:
 * new events are added, moved dates are updated, and events that vanish before their check-out are marked cancelled.
 * Past events that a site stops listing are kept, since sites drop old stays from their calendar links.
 * Then the feed's blocked nights (what stops double bookings) are rebuilt from the active upcoming stays.
 */
export async function applyFeedEvents(feed: { id: string; property_id: string }, channel: string, events: IcsEvent[], today: string): Promise<FeedResult> {
  const out: FeedResult = { added: 0, updated: 0, changed: 0, cancelled: 0, unchanged: 0, clashes: [] };
  await tx(async c => {
    await lockProperty(c, feed.property_id);
    const existing = await q<Existing>(
      "SELECT id, ical_uid, check_in, check_out, status, kind, kind_locked, external_ref, guest_name, guest_name_source FROM channel_reservations WHERE feed_id = $1", [feed.id], c);
    const seen = new Set<string>();
    const activeFuture = existing.filter(r => r.status === "confirmed" && r.check_out > today).length;
    // A site that suddenly returns an empty calendar is far more likely broken than every guest cancelling at once.
    if (events.length === 0 && activeFuture >= 3) { out.kept = `The calendar link came back empty, so the ${activeFuture} upcoming stays were kept. Check the link on the other site.`; return; }

    for (const e of events) {
      const cls = classifyEvent(channel, e.summary, e.description);
      const detail = (e.description || "").slice(0, 2000), phone = phoneLast4(e.description || "");
      const match = (e.uid && existing.find(r => r.ical_uid === e.uid && !seen.has(r.id)))
        || existing.find(r => !r.ical_uid && r.check_in === e.start && r.check_out === e.end && !seen.has(r.id))
        || (cls.ref && existing.find(r => r.external_ref && r.external_ref.toUpperCase() === cls.ref && !seen.has(r.id)));
      if (match) seen.add(match.id);
      if (e.cancelled) {
        if (match && match.status !== "cancelled") { await cancel(c, match.id); out.cancelled++; }
        continue;
      }
      if (!match) {
        const ref = cls.ref && !(await refTaken(c, channel, cls.ref, null)) ? cls.ref : "";
        const row = await one<{ id: string }>(
          `INSERT INTO channel_reservations (property_id, feed_id, channel, kind, source, ical_uid, external_ref, check_in, check_out, summary, guest_name, guest_name_source,
             feed_detail, phone_last4, ref_source)
           VALUES ($1, $2, $3, $4, 'ical', $5, $6, $7, $8, $9, $10, CASE WHEN $10 = '' THEN '' ELSE 'feed' END, $11, $12, CASE WHEN $6 = '' THEN '' ELSE 'feed' END) RETURNING id`,
          [feed.property_id, feed.id, channel, cls.kind, e.uid || null, ref, e.start, e.end, e.summary, cls.guest, detail, phone], c);
        seen.add(row!.id);
        out.added++;
        continue;
      }
      const moved = match.check_in !== e.start || match.check_out !== e.end;
      const revived = match.status === "cancelled";
      const ref = !match.external_ref && cls.ref && !(await refTaken(c, channel, cls.ref, match.id)) ? cls.ref : match.external_ref;
      const kind = match.kind_locked ? match.kind : cls.kind;
      // A name typed in by a host or admin, or read from a payout file, is never replaced; only a name the calendar itself gave is kept up to date.
      const nameFromFeed = !!cls.guest && feedOwnsName(match) && cls.guest !== match.guest_name;
      const touched = moved || revived || ref !== match.external_ref || kind !== match.kind || (!match.ical_uid && !!e.uid) || nameFromFeed;
      await q(
        `UPDATE channel_reservations SET check_in = $2, check_out = $3, ical_uid = coalesce(ical_uid, $4), external_ref = $5, kind = $6, summary = $7,
           guest_name = CASE WHEN $11 THEN $8 ELSE guest_name END, guest_name_source = CASE WHEN $11 THEN 'feed' ELSE guest_name_source END, status = 'confirmed', cancelled_at = NULL, last_seen_at = now(),
           modified_at = CASE WHEN $9 THEN now() ELSE modified_at END, updated_at = CASE WHEN $10 THEN now() ELSE updated_at END,
           ref_source = CASE WHEN external_ref = '' AND $5 <> '' THEN 'feed' ELSE ref_source END, feed_detail = $12, phone_last4 = CASE WHEN $13 = '' THEN phone_last4 ELSE $13 END
         WHERE id = $1`,
        [match.id, e.start, e.end, e.uid || null, ref, kind, e.summary, cls.guest, moved, touched, nameFromFeed, detail, phone], c);
      if (moved) out.changed++; else if (touched) out.updated++; else out.unchanged++;
    }
    for (const r of existing) {
      if (seen.has(r.id) || r.status !== "confirmed") continue;
      if (r.check_out > today) { await cancel(c, r.id); out.cancelled++; }
    }
  });
  if (out.kept) return out;
  const active = await q<{ check_in: string; check_out: string; summary: string; kind: string }>(
    "SELECT check_in, check_out, summary, kind FROM channel_reservations WHERE feed_id = $1 AND status = 'confirmed' AND check_out > $2 ORDER BY check_in", [feed.id, today]);
  out.clashes = await replaceFeedBlocks(feed.property_id, "ical:" + feed.id,
    active.map(r => ({ start: r.check_in < today ? today : r.check_in, end: r.check_out, note: r.summary })));
  return out;
}

/** Whether a calendar refresh may set this reservation's guest name: only when there is none yet, or the calendar gave the current one. */
export const feedOwnsName = (r: { guest_name: string; guest_name_source: string }) =>
  r.guest_name === "" || r.guest_name_source === "feed" || r.guest_name_source === "";

async function cancel(c: Db, id: string) {
  await q("UPDATE channel_reservations SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1", [id], c);
}

async function refTaken(c: Db, channel: string, ref: string, exceptId: string | null) {
  return !!(await one("SELECT 1 FROM channel_reservations WHERE channel = $1 AND lower(external_ref) = lower($2) AND ($3::uuid IS NULL OR id <> $3)", [channel, ref, exceptId], c));
}

/** Blocks the nights of a reservation entered by hand (so the site can't be double-booked), replacing any earlier ones. */
export async function syncManualBlock(res: { id: string; property_id: string; check_in: string; check_out: string; status: string; summary: string }, today: string) {
  await q("DELETE FROM blocks WHERE source = $1", ["res:" + res.id]);
  if (res.status !== "confirmed" || res.check_out <= today) return;
  await q("INSERT INTO blocks (property_id, start_date, end_date, note, source) VALUES ($1, $2, $3, $4, $5)",
    [res.property_id, res.check_in < today ? today : res.check_in, res.check_out, res.summary, "res:" + res.id]);
}

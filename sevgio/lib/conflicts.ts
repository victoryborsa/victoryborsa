import "server-only";
import { one, q, tx } from "./db.ts";
import type { User } from "./auth.ts";
import { fmtDate, fmtShort, nightsBetween, todayLocal } from "./dates.ts";
import { channelLabel } from "./channels.ts";
import { findConflicts, hoursLabel, type ConflictStay, type ConflictUnit } from "./conflict-core.ts";
import { sendEmail, siteUrl } from "./email.ts";
import { pushToUsers } from "./push.ts";
import { logEvent } from "./log.ts";

/** One side of a conflict as it was last seen. `channel` is "sevgio" for a booking made on this website. */
export type StaySnap = {
  key: string; channel: string; site: string; ref: string; guest: string; check_in: string; check_out: string; status: string;
  property_id: string; place: string; whole_home: boolean; feed_id: string | null; booking_code: string | null; channel_id: string | null;
};
export type ConflictRow = {
  id: string; kind: "overlap" | "turnaround"; property_ids: string[]; start_date: string; end_date: string; gap_hours: string | null; needed_hours: string | null;
  snapshot: { a: StaySnap; b: StaySnap }; status: "open" | "resolved"; first_detected_at: string; last_detected_at: string; cleared_at: string | null;
  notified_at: string | null; email_result: string; push_result: string; resolved_at: string | null; resolved_by_name: string | null; resolution: string; resolution_note: string;
};
export type FeedInfo = { id: string; name: string; last_synced_at: string | null; last_error: string | null };

const ACTIVE = "('pending','awaiting_payment','confirmed')";

type Place = ConflictUnit & { title: string; host_id: string };

async function loadStays(today: string) {
  const places = await q<Place>("SELECT id, parent_id, title, host_id, check_in_time, check_out_time, turnaround_hours FROM properties");
  const byId = new Map(places.map(p => [p.id, p]));
  const placeOf = (id: string) => {
    const p = byId.get(id), h = p?.parent_id ? byId.get(p.parent_id) : null;
    return { place: p ? (h ? `${h.title} › ${p.title}` : p.title) : "", whole_home: !!p && !p.parent_id && places.some(r => r.parent_id === p.id) };
  };
  const own = await q<{ id: string; code: string; property_id: string; check_in: string; check_out: string; status: string; guest_name: string }>(
    `SELECT id, code, property_id, check_in::text, check_out::text, status, guest_name FROM bookings WHERE status IN ${ACTIVE} AND check_out >= $1`, [today]);
  // Only real reservations from other sites: unclear "Needs check" periods and dates that just copy another booking are left out
  // (they would raise false alarms); once the host marks a period as a reservation it is checked too.
  const other = await q<{ id: string; channel: string; property_id: string; check_in: string; check_out: string; external_ref: string; guest_name: string; feed_id: string | null }>(
    `SELECT id, channel, property_id, check_in::text, check_out::text, external_ref, guest_name, feed_id FROM channel_stays
     WHERE status = 'confirmed' AND eff_kind = 'reservation' AND check_out >= $1`, [today]);
  const snaps = new Map<string, StaySnap>();
  for (const b of own) snaps.set("b:" + b.id, { key: "b:" + b.id, channel: "sevgio", site: "Sevgio (direct)", ref: b.code, guest: b.guest_name, check_in: b.check_in, check_out: b.check_out,
    status: b.status, property_id: b.property_id, ...placeOf(b.property_id), feed_id: null, booking_code: b.code, channel_id: null });
  for (const c of other) snaps.set("c:" + c.id, { key: "c:" + c.id, channel: c.channel, site: channelLabel(c.channel), ref: c.external_ref, guest: c.guest_name, check_in: c.check_in, check_out: c.check_out,
    status: "confirmed", property_id: c.property_id, ...placeOf(c.property_id), feed_id: c.feed_id, booking_code: null, channel_id: c.id });
  const stays: ConflictStay[] = [...snaps.values()].map(s => ({ key: s.key, property_id: s.property_id, check_in: s.check_in, check_out: s.check_out, channel: s.channel }));
  return { places, stays, snaps };
}

/**
 * Finds every double booking and records it. New ones (and resolved ones whose dates have since changed) are left
 * waiting for an alert; ones that no longer overlap are marked cleared but stay listed until someone reviews them.
 */
export async function scanConflicts(today = todayLocal()): Promise<{ found: number; opened: number; cleared: number }> {
  return tx(async c => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('booking-conflict-scan'))");
    const { places, stays, snaps } = await loadStays(today);
    const found = findConflicts(places, stays);
    let opened = 0;
    for (const f of found) {
      const snapshot = JSON.stringify({ a: snaps.get(f.a.key), b: snaps.get(f.b.key) });
      const prev = await one<{ id: string; status: string; kind: string; start_date: string; end_date: string }>(
        "SELECT id, status, kind, start_date::text, end_date::text FROM booking_conflicts WHERE pair_key = $1", [f.pair_key], c);
      if (!prev) {
        await q(`INSERT INTO booking_conflicts (pair_key, kind, property_ids, start_date, end_date, gap_hours, needed_hours, snapshot)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (pair_key) DO NOTHING`,
          [f.pair_key, f.kind, f.property_ids, f.start, f.end, f.gap_hours, f.needed_hours, snapshot], c);
        opened++;
        continue;
      }
      // A conflict someone already resolved comes back only if the reservations' dates changed since.
      const reopen = prev.status === "resolved" && (prev.kind !== f.kind || prev.start_date !== f.start || prev.end_date !== f.end);
      if (reopen) opened++;
      await q(`UPDATE booking_conflicts SET kind = $2, property_ids = $3, start_date = $4, end_date = $5, gap_hours = $6, needed_hours = $7, snapshot = $8,
                 last_detected_at = now(), cleared_at = NULL,
                 status = CASE WHEN $9 THEN 'open' ELSE status END, notified_at = CASE WHEN $9 THEN NULL ELSE notified_at END,
                 resolved_at = CASE WHEN $9 THEN NULL ELSE resolved_at END, resolution = CASE WHEN $9 THEN '' ELSE resolution END,
                 resolution_note = CASE WHEN $9 THEN '' ELSE resolution_note END
               WHERE id = $1`,
        [prev.id, f.kind, f.property_ids, f.start, f.end, f.gap_hours, f.needed_hours, snapshot, reopen], c);
    }
    // Still open but no longer found: one stay was cancelled or moved. Past conflicts are left alone (their stays simply ended).
    const cleared = await q(
      `UPDATE booking_conflicts SET cleared_at = now() WHERE status = 'open' AND cleared_at IS NULL AND end_date >= $1 AND NOT (pair_key = ANY($2)) RETURNING id`,
      [today, found.map(f => f.pair_key)], c);
    return { found: found.length, opened, cleared: cleared.length };
  });
}

/** Scans, then alerts about anything new. Never throws: a failure is logged for admins so it can't break a sync or a page. */
export async function checkConflicts(): Promise<{ found: number; opened: number; cleared: number; alerted: number } | null> {
  try {
    const r = await scanConflicts();
    const alerted = await alertNewConflicts();
    return { ...r, alerted };
  } catch (e) {
    await logEvent("error", "Double bookings", "Could not check for double bookings", { error: String(e) });
    return null;
  }
}

const when = (t: string) => new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** How a reservation from another site reaches Sevgio, and when that site's calendar was last read successfully. */
export function syncDelayNote(site: string, feed: FeedInfo | null): string {
  if (!feed) return `${site} reservations entered by hand appear as soon as they are saved.`;
  const last = feed.last_synced_at ? `Last successful check of the ${feed.name} calendar: ${when(feed.last_synced_at)} (Eastern).` : `The ${feed.name} calendar has not been read successfully yet.`;
  return `${site} shares reservations through a calendar link that ${site} refreshes on its own schedule, and Sevgio reads it every hour, so a reservation made on ${site} can reach Sevgio a few hours later. ${last}${feed.last_error ? ` Last problem: ${feed.last_error}` : ""}`;
}

export async function feedsById(ids: (string | null)[]): Promise<Map<string, FeedInfo>> {
  const list = ids.filter((x): x is string => !!x);
  if (!list.length) return new Map();
  const rows = await q<FeedInfo>("SELECT id, name, last_synced_at, last_error FROM ical_feeds WHERE id = ANY($1)", [list]);
  return new Map(rows.map(r => [r.id, r]));
}

/** "Airbnb · HMABC123 · Jane Doe · Oct 10 - Oct 15 · Tudor Cottage" */
export function stayLine(s: StaySnap): string {
  return [s.site, s.ref || "no reference number", s.guest || "guest name unavailable", `${fmtShort(s.check_in)} - ${fmtShort(s.check_out)}`, s.place + (s.whole_home ? " (whole house)" : "")].join(" · ");
}

/** The listing name for a conflict: "Tudor House", or "Tudor House: whole house and Rose Room" when a house and one of its rooms clash. */
export function conflictTitle(c: Pick<ConflictRow, "snapshot">): string {
  const { a, b } = c.snapshot;
  if (a.property_id === b.property_id) return a.place;
  const [house, room] = a.whole_home ? [a, b] : b.whole_home ? [b, a] : [null, null];
  if (house && room && room.place.startsWith(house.place + " › ")) return `${house.place}: whole house and ${room.place.slice(house.place.length + 3)}`;
  return `${a.place} + ${b.place}`;
}

/** One-line explanation of the clash, for alerts and the review page. */
export function conflictSummary(c: Pick<ConflictRow, "kind" | "start_date" | "end_date" | "gap_hours" | "needed_hours" | "snapshot">): string {
  const { a, b } = c.snapshot;
  const linked = a.property_id !== b.property_id;
  const short = (x: StaySnap) => (x.whole_home ? "the whole house" : x.place.split(" › ").pop()!);
  const where = linked ? `${short(a)} and ${short(b)}` : a.place;
  if (c.kind === "overlap") {
    const n = nightsBetween(c.start_date, c.end_date);
    return `${n} night${n === 1 ? "" : "s"} booked twice (${fmtShort(c.start_date)} - ${fmtShort(c.end_date)})${linked ? `: ${where} share these nights` : ""}.`;
  }
  const gap = Number(c.gap_hours), need = Number(c.needed_hours);
  return `Not enough turnover time on ${fmtDate(c.start_date)}: ${gap < 0 ? `the next guest arrives ${hoursLabel(gap)}` : `${hoursLabel(gap)} between check-out and check-in`}${need > 0 ? `, but ${hoursLabel(need)} are needed` : ""}.`;
}

/** Emails and push-notifies admins and the listing's host about conflicts not alerted yet. Each conflict is claimed first, so it's sent once. */
export async function alertNewConflicts(): Promise<number> {
  const pending = await q<{ id: string }>("SELECT id FROM booking_conflicts WHERE status = 'open' AND cleared_at IS NULL AND notified_at IS NULL ORDER BY start_date LIMIT 50");
  let n = 0;
  for (const p of pending) {
    const c = await one<ConflictRow>(
      `UPDATE booking_conflicts SET notified_at = now() WHERE id = $1 AND notified_at IS NULL
       RETURNING id, kind, property_ids, start_date::text, end_date::text, gap_hours, needed_hours, snapshot, status, first_detected_at, last_detected_at, cleared_at, notified_at, email_result, push_result, resolved_at, NULL AS resolved_by_name, resolution, resolution_note`, [p.id]);
    if (!c) continue;
    n++;
    const people = await q<{ id: string; email: string; role: string }>(
      `SELECT id, email, role FROM users WHERE role = 'admin' OR id IN (SELECT host_id FROM properties WHERE id = ANY($1)) ORDER BY role`, [c.property_ids]);
    const link = (role: string) => `${role === "admin" ? "/admin" : "/host"}/conflicts/${c.id}`;
    const feeds = await feedsById([c.snapshot.a.feed_id, c.snapshot.b.feed_id]);
    const delays = [c.snapshot.a, c.snapshot.b].filter(s => s.channel !== "sevgio").map(s => syncDelayNote(s.site, s.feed_id ? feeds.get(s.feed_id) ?? null : null));
    const subject = `Double booking: ${conflictTitle(c)}${c.kind === "overlap" ? `, ${fmtShort(c.start_date)} - ${fmtShort(c.end_date)}` : `, turnover on ${fmtShort(c.start_date)}`}`;
    const text = (role: string) => [
      c.kind === "overlap" ? "Sevgio found two reservations for the same nights." : "Sevgio found two back-to-back reservations without enough turnover time.",
      "", conflictSummary(c), "",
      `1. ${stayLine(c.snapshot.a)}`, `2. ${stayLine(c.snapshot.b)}`, "",
      "Neither reservation has been cancelled. Review the conflict and decide what to do:",
      siteUrl() + link(role),
      ...(delays.length ? ["", "About timing:", ...[...new Set(delays)]] : []),
    ].join("\n");
    const results = await Promise.all(people.map(u => sendEmail(u.email, subject, text(u.role))));
    const emailed = results.filter(r => r.ok).length;
    const push = await pushToUsers(people.map(u => u.id), uid => ({
      title: c.kind === "overlap" ? "Double booking found" : "Turnover conflict",
      body: `${conflictTitle(c)}: ${c.snapshot.a.site} ${c.snapshot.a.ref || ""} and ${c.snapshot.b.site} ${c.snapshot.b.ref || ""}, ${fmtShort(c.start_date)}${c.end_date > c.start_date ? ` - ${fmtShort(c.end_date)}` : ""}`.replace(/\s+/g, " "),
      url: link(people.find(x => x.id === uid)?.role || "host"), tag: "conflict-" + c.id,
    }));
    const emailResult = !people.length ? "No one to email" : results.every(r => r.error === "not-configured") ? "Email is not set up on the server"
      : `Emailed ${emailed} of ${people.length}`;
    const pushResult = push.devices ? `Sent to ${push.sent} of ${push.devices} device${push.devices === 1 ? "" : "s"}` : "No devices have phone alerts on";
    await q("UPDATE booking_conflicts SET email_result = $2, push_result = $3 WHERE id = $1", [c.id, emailResult, pushResult]);
    await logEvent("warn", "Double bookings", subject, { conflict: c.id, email: emailResult, push: pushResult });
  }
  return n;
}

/** SQL limiting conflicts to listings this user manages (hosts: their own listings and rooms). */
function scope(u: User, alias = "k") {
  return u.role === "admin" ? { sql: "TRUE", params: [] as unknown[] }
    : { sql: `${alias}.property_ids && ARRAY(SELECT id FROM properties WHERE host_id = $1 OR parent_id IN (SELECT id FROM properties WHERE host_id = $1))`, params: [u.id] as unknown[] };
}

const COLS = `k.id, k.kind, k.property_ids, k.start_date::text, k.end_date::text, k.gap_hours, k.needed_hours, k.snapshot, k.status, k.first_detected_at, k.last_detected_at, k.cleared_at,
  k.notified_at, k.email_result, k.push_result, k.resolved_at, r.name AS resolved_by_name, k.resolution, k.resolution_note`;

export async function listConflicts(u: User, which: "open" | "resolved"): Promise<ConflictRow[]> {
  const s = scope(u);
  return q<ConflictRow>(
    `SELECT ${COLS} FROM booking_conflicts k LEFT JOIN users r ON r.id = k.resolved_by WHERE k.status = '${which === "open" ? "open" : "resolved"}' AND ${s.sql}
     ORDER BY ${which === "open" ? "(k.cleared_at IS NOT NULL), k.start_date" : "k.resolved_at DESC"} LIMIT 200`, s.params);
}

export async function getConflict(u: User, id: string): Promise<ConflictRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const s = scope(u);
  return one<ConflictRow>(`SELECT ${COLS} FROM booking_conflicts k LEFT JOIN users r ON r.id = k.resolved_by WHERE k.id = $${s.params.length + 1} AND ${s.sql}`, [...s.params, id]);
}

/** Unresolved conflicts for the dashboard banner: still overlapping, and no longer overlapping but not yet reviewed. */
export async function openConflictCounts(u: User): Promise<{ active: number; cleared: number }> {
  const s = scope(u);
  const r = await one<{ active: number; cleared: number }>(
    `SELECT count(*) FILTER (WHERE cleared_at IS NULL)::int AS active, count(*) FILTER (WHERE cleared_at IS NOT NULL)::int AS cleared
     FROM booking_conflicts k WHERE status = 'open' AND ${s.sql}`, s.params);
  return r ?? { active: 0, cleared: 0 };
}


/** Whether a reservation in a conflict is still active now (it may have been cancelled or moved since). */
export async function stillActive(s: StaySnap): Promise<boolean> {
  const [kind, id] = s.key.split(":");
  const r = kind === "b"
    ? await one(`SELECT 1 FROM bookings WHERE id = $1 AND status IN ${ACTIVE}`, [id])
    : await one("SELECT 1 FROM channel_stays WHERE id = $1 AND status = 'confirmed' AND eff_kind = 'reservation'", [id]);
  return !!r;
}

/** Calendar links for the listings this user manages, with when each was last read successfully. */
export async function feedStatus(u: User) {
  return q<FeedInfo & { place: string }>(
    `SELECT f.id, f.name, f.last_synced_at, f.last_error, p.title AS place FROM ical_feeds f JOIN properties p ON p.id = f.property_id
     WHERE ${u.role === "admin" ? "TRUE" : "(p.host_id = $1 OR p.parent_id IN (SELECT id FROM properties WHERE host_id = $1))"} ORDER BY p.title, f.name`,
    u.role === "admin" ? [] : [u.id]);
}

/** Listings this user manages, with their turnover time. */
export async function turnoverSettings(u: User) {
  return q<{ id: string; title: string; parent_title: string | null; turnaround_hours: number; check_in_time: string; check_out_time: string }>(
    `SELECT p.id, p.title, h.title AS parent_title, p.turnaround_hours, p.check_in_time, p.check_out_time FROM properties p LEFT JOIN properties h ON h.id = p.parent_id
     WHERE ${u.role === "admin" ? "TRUE" : "p.host_id = $1"} ORDER BY coalesce(h.title, p.title), p.parent_id NULLS FIRST, p.title`, u.role === "admin" ? [] : [u.id]);
}

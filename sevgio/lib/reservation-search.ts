import { q } from "./db.ts";
import { paymentStatus, reservationStatus } from "./statuses.ts";
import { reviewKeys } from "./review.ts";
import { channelLabel } from "./channels.ts";
import { compactRef, likeSafe, localNow, nameWords, sortResults, stayPhase, type Phase, type SearchRow } from "./booking-ref.ts";

type BookingHit = { id: string; code: string; guest_name: string; guest_email: string; title: string; check_in: string; check_out: string; guests: number; status: string;
  payment_method: string | null; payment_status: string; total_cents: number; paid_cents: number; created_at: string; check_in_time: string; check_out_time: string };
type ChannelHit = { id: string; eff_kind: string; summary: string; channel: string; external_ref: string; guest_name: string; title: string; check_in: string; check_out: string; guests: number | null; status: string;
  received_payout_cents: number | null; expected_payout_cents: number | null; created_at: string; check_in_time: string; check_out_time: string };

/**
 * Finds reservations by booking reference (whole or part, any capitalization, with or without the dash)
 * or by guest name (any part of it, each word matched on its own), or by the guest's email address. Covers Sevgio bookings and reservations
 * from other sites, in every state: upcoming, staying now, past, cancelled, declined and expired.
 * `hostId` limits the search to one host's listings; admins pass null.
 */
export async function searchReservations(term: string, today: string, opts: { hostId?: string | null; phase?: Phase | "all"; limit?: number } = {}): Promise<SearchRow[]> {
  const words = nameWords(term).map(likeSafe);
  const ref = compactRef(term);
  const host = opts.hostId ?? null;
  const limit = opts.limit ?? 100;
  // Each word must appear in the guest's name (or their email, when an email address is typed); or the compacted reference contains what was typed.
  const byEmail = term.includes("@");
  const nameCond = (col: string, email: string | null) =>
    `(SELECT bool_and(${col} ILIKE '%' || w || '%'${email && byEmail ? ` OR ${email} ILIKE '%' || w || '%'` : ""}) FROM unnest($1::text[]) w)`;
  const refCond = (col: string) => `($2 <> '' AND length($2) >= 3 AND regexp_replace(upper(${col}), '[^A-Z0-9]', '', 'g') LIKE '%' || $2 || '%')`;
  const any = words.length === 0;

  const [review, bookings, channel] = await Promise.all([
    reviewKeys(),
    q<BookingHit>(
      `SELECT b.id, b.code, b.guest_name, g.email AS guest_email, coalesce(hp.title || ' › ' || p.title, p.title) AS title, b.check_in::text, b.check_out::text, b.guests, b.status,
              b.payment_method, b.payment_status, b.total_cents, b.paid_cents, b.created_at, p.check_in_time, p.check_out_time
       FROM bookings b JOIN properties p ON p.id = b.property_id LEFT JOIN properties hp ON hp.id = p.parent_id JOIN users g ON g.id = b.guest_id
       WHERE ($3::uuid IS NULL OR p.host_id = $3) AND ($4 OR ${nameCond("b.guest_name", "g.email")} OR ${refCond("b.code")})
       ORDER BY b.check_in DESC LIMIT 300`,
      [words, ref, host, any],
    ),
    q<ChannelHit>(
      `SELECT c.id, c.eff_kind, c.summary, c.channel, c.external_ref, c.guest_name, coalesce(hp.title || ' › ' || p.title, p.title) AS title, c.check_in::text, c.check_out::text, c.guests, c.status, c.received_payout_cents, c.expected_payout_cents, c.created_at, p.check_in_time, p.check_out_time
       FROM channel_stays c JOIN properties p ON p.id = c.property_id LEFT JOIN properties hp ON hp.id = p.parent_id
       WHERE c.eff_kind IN ('reservation', 'unknown') AND ($3::uuid IS NULL OR p.host_id = $3)
         AND ($4 OR ${nameCond("c.guest_name", null)} OR ${refCond("c.external_ref")})
       ORDER BY c.check_in DESC LIMIT 300`,
      [words, ref, host, any],
    ),
  ]);

  // Staying now starts and ends at the listing's check-in and check-out times, in Pittsburgh time (only when searching as of today).
  const now = localNow();
  const clock = (x: { check_in_time: string; check_out_time: string }) => today === now.date ? { minutes: now.minutes, checkInTime: x.check_in_time, checkOutTime: x.check_out_time } : undefined;
  const rows: SearchRow[] = [
    ...bookings.map(b => {
      const st = reservationStatus({ ...b, today, clock: clock(b), needsReview: review.has("b:" + b.id) });
      const pay = paymentStatus(b);
      return {
        source: "sevgio" as const, id: b.id, ref: b.code, guest_name: b.guest_name, guest_email: b.guest_email, title: b.title, check_in: b.check_in, check_out: b.check_out,
        guests: b.guests, status: b.status, status_label: st.label, status_tone: st.tone, pay_label: pay.detail ? `${pay.label} · ${pay.detail}` : pay.label, pay_tone: pay.tone,
        phase: stayPhase(b.status, b.check_in, b.check_out, today, clock(b)), href: `/admin/bookings/${b.code}`, site: "Sevgio.com", created_at: b.created_at,
      };
    }),
    ...channel.map(c => {
      const site = channelLabel(c.channel);
      const cst = reservationStatus({ status: c.status, check_in: c.check_in, check_out: c.check_out, today, kind: c.eff_kind, clock: clock(c), needsReview: review.has("c:" + c.id) });
      return {
        source: "channel" as const, id: c.id, ref: c.external_ref, guest_name: c.guest_name, guest_email: "", title: c.title, check_in: c.check_in, check_out: c.check_out,
        guests: c.guests, status: c.status, status_label: cst.label, status_tone: cst.tone,
        pay_label: c.received_payout_cents != null ? "Paid · payout received" : c.expected_payout_cents != null ? "Payment unavailable · payout not received yet" : "Payment unavailable",
        pay_tone: c.received_payout_cents != null ? "ok" as const : "neutral" as const,
        phase: stayPhase(c.status, c.check_in, c.check_out, today, clock(c)), href: `/host/bookings/other-sites/${c.id}`, site, created_at: c.created_at,
        channel: { key: c.channel, eff_kind: c.eff_kind, summary: c.summary },
      };
    }),
  ];
  const phase = opts.phase && opts.phase !== "all" ? opts.phase : null;
  return sortResults(phase ? rows.filter(r => r.phase === phase) : rows, term).slice(0, limit);
}

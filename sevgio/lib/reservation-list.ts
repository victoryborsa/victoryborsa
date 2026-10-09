import "server-only";
import { q } from "./db.ts";
import { fmtDate, localDateOf, nightsBetween } from "./dates.ts";
import { channelLabel } from "./channels.ts";
import { partyLabel } from "./party.ts";
import { paymentStatus, reservationStatus, type Tone } from "./statuses.ts";
import { editRule, inScope, type ResSource, type Scope } from "./reservation-rules.ts";
import { unreadFromGuests } from "./messaging.ts";
import type { StayDetail } from "@/components/CalDetails.tsx";

/** How the message icon on a card behaves: Sevgio's own conversation, or why there is none. */
export type MsgLink = { kind: "sevgio"; href: string; unread: number } | { kind: "none"; why: string };

/** One reservation card on the Reservations list. Anything a site didn't send is labeled as not provided, never guessed. */
export type ResCard = {
  key: string; source: ResSource; channel: string; sourceLabel: string; pid: string; home: string; room: string | null; place: string;
  from: string; to: string; nights: number; booked: string | null; label: string;
  guest: string | null; guestMissing: string; guests: string | null; code: string | null;
  status: string; cancelled: boolean; statusTone: Tone; pay: string; payTone: Tone; editable: boolean; editReason: string;
  href: string; msg: MsgLink; detail: StayDetail;
};

type Place = { id: string; title: string; parent_id: string | null };
type BRow = { id: string; code: string; property_id: string; check_in: string; check_out: string; status: string; guest_name: string; guests: number; nights: number;
  adults: number; children: number; free_children: number; pets: number; created_at: string; payment_method: string | null; payment_status: string; total_cents: number; paid_cents: number; due_now_cents: number };
type CRow = { id: string; property_id: string; channel: string; feed_name: string | null; eff_kind: string; status: string; check_in: string; check_out: string; external_ref: string;
  guest_name: string; guests: number | null; received_payout_cents: number | null; expected_payout_cents: number | null };

const money = (c: number) => "$" + (c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
const long = (d: string) => fmtDate(d, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/** Which stays to load for a scope around `day`: SQL conditions on check-in / check-out (a cheap first cut; `inScope` decides). */
const WHERE: Record<Scope, string> = {
  today: "check_in <= $2 AND check_out >= $2",
  upcoming: "check_out >= $2",
  history: "(check_out < $2 OR status = 'cancelled')",
};

/**
 * Sevgio bookings and reservations from other sites on these listings, for the Today / Upcoming / History list.
 * `staffBase` is where a Sevgio booking's full page is ("/admin/bookings/" for admins, "/trips/" for hosts).
 */
export async function loadReservations(o: { ids: string[]; places: Place[]; scope: Scope; day: string; staffBase: string; back: string }): Promise<ResCard[]> {
  if (!o.ids.length) return [];
  const limit = o.scope === "history" ? 200 : 400;
  const order = o.scope === "history" ? "check_in DESC" : "check_in";
  const statuses = o.scope === "history" ? ["confirmed", "cancelled"] : ["pending", "awaiting_payment", "confirmed"];
  const [bookings, stays] = await Promise.all([
    q<BRow>(`SELECT id, code, property_id, check_in::text, check_out::text, status, guest_name, guests, nights, adults, children, free_children, pets, created_at,
                    payment_method, payment_status, total_cents, paid_cents, due_now_cents
             FROM bookings WHERE property_id = ANY($1) AND status = ANY($3) AND ${WHERE[o.scope]} ORDER BY ${order} LIMIT ${limit}`, [o.ids, o.day, statuses]),
    q<CRow>(`SELECT c.id, c.property_id, c.channel, f.name AS feed_name, c.eff_kind, c.status, c.check_in::text, c.check_out::text, c.external_ref, c.guest_name, c.guests,
                    c.received_payout_cents, c.expected_payout_cents
             FROM channel_stays c LEFT JOIN ical_feeds f ON f.id = c.feed_id
             WHERE c.property_id = ANY($1) AND c.eff_kind <> 'mirror' AND c.status = ANY($3) AND ${WHERE[o.scope].replaceAll("check_", "c.check_").replace("status", "c.status")}
             ORDER BY c.${order} LIMIT ${limit}`, [o.ids, o.day, o.scope === "history" ? ["confirmed", "cancelled"] : ["confirmed"]]),
  ]);
  const byId = new Map(o.places.map(p => [p.id, p]));
  const where = (pid: string) => {
    const p = byId.get(pid), h = p?.parent_id ? byId.get(p.parent_id) : null;
    return { home: h?.title || p?.title || "Listing", room: h ? p!.title : null, place: h ? `${h.title} › ${p!.title}` : p?.title || "Listing" };
  };
  const unread = await unreadFromGuests(bookings.map(b => b.id));
  const backQ = `?back=${encodeURIComponent(o.back)}`;

  const cards: ResCard[] = [
    ...bookings.map((b): ResCard => {
      const w = where(b.property_id);
      const st = reservationStatus({ status: b.status, check_in: b.check_in, check_out: b.check_out, today: o.day });
      const pay = paymentStatus(b);
      const rule = editRule({ source: "direct", status: b.status, payment_status: b.payment_status, paid_cents: b.paid_cents });
      const guests = `${b.guests} guest${b.guests === 1 ? "" : "s"}`;
      const href = `${o.staffBase}${b.code}`;
      const msg: MsgLink = { kind: "sevgio", href: `/trips/${b.code}/messages${backQ}`, unread: unread.get(b.id) || 0 };
      return {
        key: "b:" + b.id, source: "direct", channel: "sevgio", sourceLabel: "Sevgio.com", pid: b.property_id, ...w,
        from: b.check_in, to: b.check_out, nights: b.nights, booked: localDateOf(b.created_at), label: b.guest_name,
        guest: b.guest_name, guestMissing: "", guests: `${guests} (${partyLabel(b)})`, code: b.code,
        status: st.label, cancelled: b.status === "cancelled", statusTone: st.tone, pay: pay.label, payTone: pay.tone, editable: rule.editable, editReason: rule.reason, href, msg,
        detail: { title: b.guest_name, badge: st.label, badgeCls: st.tone, href, hrefLabel: rule.editable ? "Open and edit reservation" : "Open full reservation",
          note: rule.reason, locked: !rule.editable, msgHref: msg.href, rows: [
            ["Property", w.home], ["Room", w.room || "Whole home"], ["Check-in", long(b.check_in)], ["Check-out", long(b.check_out)],
            ["Nights", String(b.nights)], ["Guests", `${b.guests} (${partyLabel(b)})`], ["Booked on", "Sevgio.com"], ["Confirmation number", b.code],
            ["Payment", pay.detail ? `${pay.label} · ${pay.detail}` : pay.label], ["Total", money(b.total_cents)],
          ] },
      };
    }),
    ...stays.map((c): ResCard => {
      const w = where(c.property_id);
      const site = c.channel === "other" ? c.feed_name || "Other site" : channelLabel(c.channel);
      const block = c.eff_kind !== "reservation";
      const st = reservationStatus({ status: c.status, check_in: c.check_in, check_out: c.check_out, today: o.day, kind: c.eff_kind });
      const rule = editRule({ source: block ? "block" : "external", status: c.status });
      const nights = nightsBetween(c.check_in, c.check_out);
      const guestMissing = block ? "No guest details: dates only" : `Name not provided by ${site}`;
      const guests = c.guests ? `${c.guests} guest${c.guests === 1 ? "" : "s"}` : null;
      const pay = block ? { label: "No payment (calendar block)", tone: "neutral" as Tone }
        : c.received_payout_cents != null ? { label: `Payout received ${money(c.received_payout_cents)}`, tone: "ok" as Tone }
        : c.expected_payout_cents != null ? { label: `Payout expected ${money(c.expected_payout_cents)}`, tone: "neutral" as Tone }
        : { label: `Payment info not provided by ${site}`, tone: "neutral" as Tone };
      const href = `/host/bookings/other-sites/${c.id}`;
      const msg: MsgLink = { kind: "none", why: block ? "No guest to message: these dates are only closed on the other site's calendar."
        : `Messaging isn't connected for ${site}. A calendar link carries dates only, not messages. Reply to the guest in the ${site} app${c.external_ref ? ` (confirmation ${c.external_ref})` : ""}.` };
      return {
        key: "c:" + c.id, source: block ? "block" : "external", channel: c.channel, sourceLabel: site, pid: c.property_id, ...w,
        from: c.check_in, to: c.check_out, nights, booked: null, label: c.guest_name || (block ? "External Calendar Block" : guestMissing),
        guest: c.guest_name || null, guestMissing, guests, code: c.external_ref || null,
        status: st.label, cancelled: c.status === "cancelled", statusTone: st.tone, pay: pay.label, payTone: pay.tone, editable: false, editReason: rule.reason, href, msg,
        detail: { title: c.guest_name || (block ? "External Calendar Block" : guestMissing), badge: `${st.label} · ${site}`, badgeCls: `neutral ar-status ch-${c.channel}`, href,
          hrefLabel: "View synced details", note: rule.reason, locked: true, rows: [
            ["Property", w.home], ["Room", w.room || "Whole home"], ["Check-in", long(c.check_in)], ["Check-out", long(c.check_out)], ["Nights", String(nights)],
            ["Guests", block ? "Not applicable" : guests || `Not provided by ${site}`], ["Booked on", site],
            ["Confirmation number", c.external_ref || (block ? "None (calendar block)" : `Not provided by ${site}`)], ["Payment", pay.label],
            ["Messaging", msg.why],
          ] },
      };
    }),
  ];
  return cards.filter(c => inScope(o.scope, { from: c.from, to: c.to, status: c.cancelled ? "cancelled" : "confirmed" }, o.day));
}

import Link from "next/link";
import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { scopeSql } from "@/lib/access.ts";
import { expireStaleRequests } from "@/lib/bookings.ts";
import { financeListings, placeName } from "@/lib/finance.ts";
import { compactRef, likeSafe, localNow, nameWords, stayPhase, type Phase } from "@/lib/booking-ref.ts";
import { Flash } from "@/components/Flash.tsx";
import { BookingTable, type BookingRow, type PlatformRow } from "@/components/BookingTable.tsx";
import { markSeen } from "@/lib/alerts.ts";
import { BookingTabs } from "@/components/BookingTabs.tsx";
import { MissingNames } from "@/components/MissingNames.tsx";
import { RecentImports } from "@/components/RecentImports.tsx";

// `platform` picks the reservations from Airbnb, Booking.com, Vrbo and other sites that belong in the same list.
// `phase` keeps only stays in that part of their timeline, using the listing's check-in and check-out times in Pittsburgh time:
// a stay is Upcoming until check-in time on arrival day, Staying now until check-out time on departure day, then Past.
const VIEWS: Record<string, { label: string; where: string; order: "in-asc" | "in-desc" | "updated-desc"; platform: string | null; phase?: Phase }> = {
  upcoming: { label: "Upcoming", where: "b.status IN ('pending','awaiting_payment','confirmed') AND b.check_out >= $T", order: "in-asc", platform: "c.status = 'confirmed' AND c.check_out >= $T", phase: "upcoming" },
  staying: { label: "Staying now", where: "b.status IN ('pending','awaiting_payment','confirmed') AND b.check_in <= $T AND b.check_out >= $T", order: "in-asc", platform: "c.status = 'confirmed' AND c.check_in <= $T AND c.check_out >= $T", phase: "current" },
  requests: { label: "Requests", where: "b.status = 'pending'", order: "in-asc", platform: null },
  past: { label: "Past", where: "b.status = 'confirmed' AND b.check_out <= $T", order: "in-desc", platform: "c.status = 'confirmed' AND c.check_out <= $T", phase: "past" },
  cancelled: { label: "Cancelled & declined", where: "b.status IN ('cancelled','declined','expired')", order: "updated-desc", platform: "c.status = 'cancelled'" },
};
const ORDER_SQL = { "in-asc": "check_in", "in-desc": "check_in DESC", "updated-desc": "updated_at DESC" };

/** Each typed word must be in the guest's name, or the reference (with or without dashes) contains what was typed. */
const matchSql = (name: string, ref: string, w: string, r: string) =>
  `((SELECT bool_and(${name} ILIKE '%' || x || '%') FROM unnest(${w}::text[]) x) OR (length(${r}) >= 3 AND regexp_replace(upper(${ref}), '[^A-Z0-9]', '', 'g') LIKE '%' || ${r} || '%'))`;

export default async function HostBookings({ searchParams }: { searchParams: Promise<{ view?: string; msg?: string; q?: string }> }) {
  const u = await requireUser(["host", "admin"], "/host/bookings");
  await expireStaleRequests();
  const sp = await searchParams;
  const view = VIEWS[sp.view || ""] ? sp.view! : "upcoming";
  const v = VIEWS[view];
  const term = (sp.q || "").trim().slice(0, 80);
  const words = nameWords(term).map(likeSafe), ref = compactRef(term);
  const now = localNow(), today = now.date;

  const s = scopeSql(u);
  const params: unknown[] = [...s.params];
  if (v.where.includes("$T")) params.push(today);
  const T = "$" + params.length;
  let find = "";
  if (term) { params.push(words, ref); find = ` AND ${matchSql("b.guest_name", "b.code", "$" + (params.length - 1), "$" + params.length)}`; }
  const all = await q<BookingRow>(
    `SELECT b.*, p.title, p.check_in_time, p.check_out_time, g.email AS guest_email FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.guest_id
     WHERE ${s.sql} AND ${v.where.replaceAll("$T", T)}${find} ORDER BY b.${ORDER_SQL[v.order]} LIMIT 300`,
    params,
  );
  const inView = (status: string, x: { check_in: string; check_out: string; check_in_time?: string; check_out_time?: string }) =>
    !v.phase || stayPhase(status, x.check_in, x.check_out, today, { minutes: now.minutes, checkInTime: x.check_in_time, checkOutTime: x.check_out_time }) === v.phase;
  const rows = all.filter(b => inView(b.status, b));

  // Reservations from other sites on this person's listings (homes and their rooms), with the same date rules as Sevgio bookings:
  // Upcoming = checking out today or later, Past = checked out before today. Periods the site didn't label ("unknown", e.g. Booking.com's
  // "CLOSED - Not available") are included as external calendar blocks; dates known to be blocked and copies of another booking are left out.
  const listings = v.platform ? await financeListings(u) : [];
  const pp: unknown[] = [listings.map(l => l.id)];
  const at = (val: unknown) => { pp.push(val); return "$" + pp.length; };
  const pWhere = v.platform ? (v.platform.includes("$T") ? v.platform.replaceAll("$T", at(today)) : v.platform) : "";
  const pFind = term ? ` AND ${matchSql("c.guest_name", "c.external_ref", at(words), at(ref))}` : "";
  const platform = v.platform && listings.length ? (await q<Omit<PlatformRow, "place"> & { property_id: string }>(
    `SELECT c.id, c.property_id, c.channel, c.external_ref, c.guest_name, c.guest_name_source, c.check_in::text, c.check_out::text, c.guests, c.status, c.eff_kind,
            c.summary, c.phone_last4, c.expected_payout_cents, c.received_payout_cents, c.payout_date::text, c.updated_at, p.check_in_time, p.check_out_time
     FROM channel_stays c JOIN properties p ON p.id = c.property_id WHERE c.property_id = ANY($1) AND c.eff_kind IN ('reservation', 'unknown') AND ${pWhere}${pFind}
     ORDER BY c.${ORDER_SQL[v.order]} LIMIT 300`,
    pp,
  )).filter(r => inView(r.status, r)).map(r => ({ ...r, place: placeName(listings, r.property_id) })) : undefined;

  const fresh = await markSeen(rows.filter(r => ["pending", "awaiting_payment", "confirmed"].includes(r.status)).map(r => r.id));
  const count = rows.length + (platform?.length || 0);
  const back = `/host/bookings?view=${view}${term ? `&q=${encodeURIComponent(term)}` : ""}`;
  return (
    <>
      <Flash msg={sp.msg} />
      <BookingTabs current={view} q={term} />
      <RecentImports userId={u.role === "admin" ? null : u.id} />
      {v.platform && <MissingNames propertyIds={u.role === "admin" ? null : listings.map(l => l.id)} today={today} />}
      <form className="bk-search" method="get" action="/host/bookings" role="search">
        <input type="hidden" name="view" value={view} />
        <label className="sr-only" htmlFor="bk-q">Guest name or booking reference</label>
        <input id="bk-q" className="input" type="search" name="q" defaultValue={term} placeholder="Search guest name or booking reference" autoComplete="off" spellCheck={false} enterKeyHint="search" maxLength={80} />
        <button className="btn btn-primary">Search</button>
        {term && <Link href={`/host/bookings?view=${view}`}>Clear</Link>}
      </form>
      {term && <p className="hint" role="status" style={{ marginTop: -8, marginBottom: 12 }}><b>{count}</b> {v.label.toLowerCase()} reservation{count === 1 ? "" : "s"} matching “{term}”. Other tabs keep this search.</p>}
      {fresh.size > 0 && <div className="notice ok" role="status" style={{ marginBottom: 16 }}>{fresh.size} new booking{fresh.size === 1 ? "" : "s"} since you last looked, marked <b>New</b> below.</div>}
      <BookingTable fresh={fresh} rows={rows} platform={platform} order={v.order} today={today} now={now} back={back} />
      <p className="hint" style={{ marginTop: 10 }}>
        Guest phone numbers and emails are shown only for active bookings.
        {v.platform && <> Reservations from Airbnb, Booking.com, Vrbo and other sites are included. Calendar links carry dates, and rarely the guest&apos;s name or booking reference: import the site&apos;s reservations file, or use <b>Add details</b>. What you enter is kept when the calendars refresh.
          Dates Booking.com or Vrbo only mark as unavailable show as <b>External calendar block</b>, and become <b>Confirmed</b> when a file or the details you add match them. <Link href="/host/calendar-sync">Calendar sync status</Link></>}
      </p>
    </>
  );
}

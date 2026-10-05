import Link from "next/link";
import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { scopeSql } from "@/lib/access.ts";
import { expireStaleRequests } from "@/lib/bookings.ts";
import { todayLocal } from "@/lib/dates.ts";
import { financeListings, placeName } from "@/lib/finance.ts";
import { compactRef, likeSafe, nameWords } from "@/lib/booking-ref.ts";
import { Flash } from "@/components/Flash.tsx";
import { BookingTable, type BookingRow, type PlatformRow } from "@/components/BookingTable.tsx";
import { markSeen } from "@/lib/alerts.ts";
import { BookingTabs } from "@/components/BookingTabs.tsx";

// `platform` picks the reservations from Airbnb, Booking.com, Vrbo and other sites that belong in the same list.
const VIEWS: Record<string, { label: string; where: string; order: "in-asc" | "in-desc" | "updated-desc"; platform: string | null }> = {
  upcoming: { label: "Upcoming", where: "b.status IN ('pending','awaiting_payment','confirmed') AND b.check_out >= $T", order: "in-asc", platform: "c.status = 'confirmed' AND c.check_out >= $T" },
  requests: { label: "Requests", where: "b.status = 'pending'", order: "in-asc", platform: null },
  past: { label: "Past", where: "b.status = 'confirmed' AND b.check_out < $T", order: "in-desc", platform: "c.status = 'confirmed' AND c.check_out < $T" },
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
  const today = todayLocal();

  const s = scopeSql(u);
  const params: unknown[] = [...s.params];
  if (v.where.includes("$T")) params.push(today);
  const T = "$" + params.length;
  let find = "";
  if (term) { params.push(words, ref); find = ` AND ${matchSql("b.guest_name", "b.code", "$" + (params.length - 1), "$" + params.length)}`; }
  const rows = await q<BookingRow>(
    `SELECT b.*, p.title, g.email AS guest_email FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.guest_id
     WHERE ${s.sql} AND ${v.where.replaceAll("$T", T)}${find} ORDER BY b.${ORDER_SQL[v.order]} LIMIT 300`,
    params,
  );

  // Reservations from other sites on this person's listings (homes and their rooms). Blocked dates and copies of other bookings are left out.
  const listings = v.platform ? await financeListings(u) : [];
  const platform = v.platform && listings.length ? (await q<Omit<PlatformRow, "place"> & { property_id: string }>(
    `SELECT c.id, c.property_id, c.channel, c.external_ref, c.guest_name, c.guest_name_source, c.check_in::text, c.check_out::text, c.guests, c.status,
            c.expected_payout_cents, c.received_payout_cents, c.updated_at
     FROM channel_stays c WHERE c.property_id = ANY($1) AND c.eff_kind = 'reservation' AND ${v.platform.replaceAll("$T", "$2")}
       ${term ? `AND ${matchSql("c.guest_name", "c.external_ref", "$3", "$4")}` : ""}
     ORDER BY c.${ORDER_SQL[v.order]} LIMIT 300`,
    [listings.map(l => l.id), today, ...(term ? [words, ref] : [])],
  )).map(r => ({ ...r, place: placeName(listings, r.property_id) })) : undefined;

  const fresh = await markSeen(rows.filter(r => ["pending", "awaiting_payment", "confirmed"].includes(r.status)).map(r => r.id));
  const count = rows.length + (platform?.length || 0);
  const back = `/host/bookings?view=${view}${term ? `&q=${encodeURIComponent(term)}` : ""}`;
  return (
    <>
      <Flash msg={sp.msg} />
      <BookingTabs current={view} q={term} />
      <form className="bk-search" method="get" action="/host/bookings" role="search">
        <input type="hidden" name="view" value={view} />
        <label className="sr-only" htmlFor="bk-q">Guest name or booking reference</label>
        <input id="bk-q" className="input" type="search" name="q" defaultValue={term} placeholder="Search guest name or booking reference" autoComplete="off" spellCheck={false} enterKeyHint="search" maxLength={80} />
        <button className="btn btn-primary">Search</button>
        {term && <Link href={`/host/bookings?view=${view}`}>Clear</Link>}
      </form>
      {term && <p className="hint" role="status" style={{ marginTop: -8, marginBottom: 12 }}><b>{count}</b> {v.label.toLowerCase()} reservation{count === 1 ? "" : "s"} matching “{term}”. Other tabs keep this search.</p>}
      {fresh.size > 0 && <div className="notice ok" role="status" style={{ marginBottom: 16 }}>{fresh.size} new booking{fresh.size === 1 ? "" : "s"} since you last looked, marked <b>New</b> below.</div>}
      <BookingTable fresh={fresh} rows={rows} platform={platform} order={v.order} today={today} back={back} />
      <p className="hint" style={{ marginTop: 10 }}>
        Guest phone numbers and emails are shown only for active bookings.
        {v.platform && <> Reservations from Airbnb, Booking.com, Vrbo and other sites are included. Their calendar links rarely share the guest&apos;s name, so add it with <b>Add guest name</b>; names you enter are kept when the calendars refresh.</>}
      </p>
    </>
  );
}

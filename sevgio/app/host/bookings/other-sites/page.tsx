import Link from "next/link";
import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { fmtShort, nightsBetween, todayLocal } from "@/lib/dates.ts";
import { financeListings, placeName } from "@/lib/finance.ts";
import { CHANNELS, channelLabel, isChannel } from "@/lib/channels.ts";
import { money } from "@/lib/money.ts";
import { Flash } from "@/components/Flash.tsx";
import { AutoSubmit } from "@/components/AutoSubmit.tsx";
import { BookingTabs } from "@/components/BookingTabs.tsx";
import { setKindAction } from "@/app/actions/channel.ts";
import { GuestCell, NO_GUEST_NAME } from "@/components/GuestNameForm.tsx";

type Row = { id: string; property_id: string; channel: string; external_ref: string; guest_name: string; guest_name_source: string; check_in: string; check_out: string; status: string; kind: string; eff_kind: string;
  source: string; expected_payout_cents: number | null; received_payout_cents: number | null; rent_cents: number | null; modified_on: string | null };

const WHEN: Record<string, string> = { upcoming: "Upcoming and current", past: "Past", all: "All dates" };
const KINDS: Record<string, string> = { "": "Reservations (incl. unconfirmed)", reservation: "Confirmed reservations only", unknown: "Unconfirmed (guest or closed dates?)", blocked: "Blocked on the other site", mirror: "Copies of other bookings", cancelled: "Cancelled" };

/** Every reservation that came from Airbnb, Vrbo, Booking.com or another site, with what's still missing for Finance. */
export default async function OtherSites({ searchParams }: { searchParams: Promise<{ when?: string; kind?: string; channel?: string; property?: string; needs?: string; msg?: string }> }) {
  const u = await requireUser(["host", "admin"], "/host/bookings/other-sites");
  const sp = await searchParams;
  const listings = await financeListings(u);
  const when = WHEN[sp.when || ""] ? sp.when! : sp.needs || sp.kind ? "all" : "upcoming";
  const kind = sp.kind && KINDS[sp.kind] ? sp.kind : "";
  const channel = isChannel(sp.channel) ? sp.channel : "";
  const property = listings.find(l => l.id === sp.property && !l.parent_id)?.id || "";
  const needs = sp.needs === "1";
  const ids = listings.filter(l => !property || l.id === property || l.parent_id === property).map(l => l.id);
  const today = todayLocal();
  const rows = ids.length ? await q<Row>(
    `SELECT id, property_id, channel, external_ref, guest_name, guest_name_source, check_in, check_out, status, kind, eff_kind, source, expected_payout_cents, received_payout_cents, rent_cents, (modified_at AT TIME ZONE 'America/New_York')::date AS modified_on
     FROM channel_stays WHERE property_id = ANY($1)
       AND ($2 = 'all' OR ($2 = 'upcoming' AND check_out >= $3) OR ($2 = 'past' AND check_out < $3))
       AND (CASE $4 WHEN 'cancelled' THEN status = 'cancelled' WHEN '' THEN status = 'confirmed' AND eff_kind IN ('reservation', 'unknown') ELSE status = 'confirmed' AND eff_kind = $4 END)
       AND ($5 = '' OR channel = $5)
       AND (NOT $6 OR rent_cents IS NULL OR expected_payout_cents IS NULL)
     ORDER BY check_in ${when === "upcoming" ? "" : "DESC"} LIMIT 500`,
    [ids, when, today, kind, channel, needs]) : [];
  const homes = listings.filter(l => !l.parent_id);
  const back = `/host/bookings/other-sites?${new URLSearchParams({ when, ...(kind ? { kind } : {}), ...(channel ? { channel } : {}), ...(property ? { property } : {}), ...(needs ? { needs: "1" } : {}) })}`;

  return (
    <>
      <Flash msg={sp.msg} />
      <BookingTabs current="other-sites" />
      <form className="fin-filters" method="get" aria-label="Filters" style={{ marginBottom: 16 }}>
        <AutoSubmit />
        <label className="field"><span>Dates</span><select className="input" name="when" defaultValue={when}>{Object.entries(WHEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="field"><span>Show</span><select className="input" name="kind" defaultValue={kind}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="field"><span>Site</span><select className="input" name="channel" defaultValue={channel}><option value="">All sites</option>{CHANNELS.filter(c => c[0] !== "sevgio").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="field"><span>Property</span><select className="input" name="property" defaultValue={property}><option value="">All properties</option>{homes.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}</select></label>
        <label className="chk fin-chk"><input type="checkbox" name="needs" value="1" defaultChecked={needs} /> Only ones missing payout details</label>
        <div className="fin-actions">
          <Link className="btn btn-ghost" href="/host/finance/import">Import payout file</Link>
          <Link className="btn btn-primary" href="/host/bookings/other-sites/new">Add a reservation</Link>
        </div>
      </form>
      {rows.length === 0 ? <div className="empty"><p className="muted">Nothing here. Reservations appear once a calendar link from Airbnb, Vrbo or Booking.com is added to a listing (Listings › Calendar), or when you import a payout file.</p></div> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Site</th><th>Reference</th><th>Listing</th><th>Guest</th><th>Dates</th><th className="num">Nights</th><th>Status</th><th className="num">Expected payout</th><th className="num">Received</th><th></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td><span className={`pill neutral ch-dot ch-${r.channel}`}>{channelLabel(r.channel)}</span></td>
                  <td className="mono">{r.external_ref || <span className="muted">–</span>}</td>
                  <td>{placeName(listings, r.property_id)}</td>
                  <td style={{ minWidth: 170 }}>{r.eff_kind === "reservation" ? <GuestCell name={r.guest_name} source={r.guest_name_source} site={channelLabel(r.channel)} /> : r.guest_name || <span className="muted">{NO_GUEST_NAME}</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtShort(r.check_in)} – {fmtShort(r.check_out)}{r.modified_on && <div className="hint">Dates changed {fmtShort(r.modified_on)}</div>}</td>
                  <td className="num">{nightsBetween(r.check_in, r.check_out)}</td>
                  <td>{r.status === "cancelled" ? <span className="pill danger">Cancelled</span>
                    : r.eff_kind === "unknown" ? <span className="pill warn">Unconfirmed</span>
                    : r.eff_kind === "blocked" ? <span className="pill neutral">Blocked</span>
                    : r.eff_kind === "mirror" ? <span className="pill neutral">Copy of another booking</span>
                    : r.check_in <= today && today < r.check_out ? <span className="pill ok">Staying now</span>
                    : <span className="pill ok">Confirmed</span>}</td>
                  <td className="num">{r.expected_payout_cents == null ? <span className="needs">Needs entry</span> : money(r.expected_payout_cents)}</td>
                  <td className="num">{r.received_payout_cents == null ? <span className="muted">–</span> : money(r.received_payout_cents)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.eff_kind === "unknown" && r.status === "confirmed" && (
                      <span className="row" style={{ gap: 6, display: "inline-flex", marginRight: 6 }}>
                        {([["reservation", "It's a reservation"], ["blocked", "It's closed dates"]] as const).map(([k, label]) => (
                          <form key={k} action={setKindAction}>
                            <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="kind" value={k} />
                            <button className="btn btn-ghost btn-sm">{label}</button>
                          </form>
                        ))}
                      </span>
                    )}
                    <Link className="btn btn-ghost btn-sm" href={`/host/bookings/other-sites/${r.id}`}>{r.rent_cents == null && r.eff_kind === "reservation" ? "Add payout details" : "Open"}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint" style={{ marginTop: 10 }}>
        Calendar links from other sites share only dates (and on Airbnb, the confirmation code), never prices or payouts, and usually not the guest&apos;s name.
        Add a missing name or reference with <b>Add details</b> in Bookings or on the reservation; details entered by hand, or read from a payout file, are kept when the calendars refresh. Add those by importing the site&apos;s payout file or by hand.
        Refreshing a calendar link updates these reservations in place: changed dates are updated and reservations removed on the other site are marked cancelled, so nothing is duplicated.
        Past reservations stay here even after the other site drops them from its calendar link.
      </p>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth.ts";
import { one } from "@/lib/db.ts";
import { fmtDate, nightsBetween, fmtWhen, type Instant } from "@/lib/dates.ts";
import { financeListings, placeName } from "@/lib/finance.ts";
import { channelLabel } from "@/lib/channels.ts";
import { Flash } from "@/components/Flash.tsx";
import { BlockStatus, DetailsCell, GuestCell } from "@/components/GuestNameForm.tsx";
import { ChannelResForm, type ChannelResValues } from "@/components/ChannelResForm.tsx";
import { EXTERNAL_NOTES_EDITABLE } from "@/lib/reservation-rules.ts";
import { money } from "@/lib/money.ts";

type Res = ChannelResValues & { guest_name_source: string; phone_last4: string; feed_detail: string; ref_source: string; guest_name_at: string | null; guest_name_by_name: string | null; id: string; property_id: string; channel: string; source: string; status: string; eff_kind: string; check_in: string; check_out: string; summary: string;
  feed_name: string | null; first_seen_at: string; last_seen_at: string; modified_at: string | null; cancelled_at: string | null; finance_source: string };

const when = (t: Instant) => fmtWhen(t);

export default async function OtherSiteReservation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params;
  const u = await requireUser(["host", "admin"], `/host/bookings/other-sites/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await one<Res>(`SELECT c.*, f.name AS feed_name, nb.name AS guest_name_by_name FROM channel_stays c LEFT JOIN ical_feeds f ON f.id = c.feed_id
     LEFT JOIN users nb ON nb.id = c.guest_name_by WHERE c.id = $1`, [id]);
  const listings = await financeListings(u);
  if (!r || !listings.some(l => l.id === r.property_id)) notFound();
  const site = channelLabel(r.channel);
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 820 }}>
      <Flash msg={(await searchParams).msg} />
      <p><Link href="/host/bookings/other-sites">‹ Other sites</Link></p>
      <div className="row" style={{ alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>{site} {r.eff_kind === "reservation" ? "reservation" : r.eff_kind === "unknown" ? "calendar block" : "blocked dates"}{r.external_ref ? ` ${r.external_ref}` : ""}</h2>
        {r.status === "cancelled" ? <span className="pill danger">Cancelled</span> : r.eff_kind === "mirror" ? <span className="pill neutral">Copy of another booking (not counted)</span>
          : r.eff_kind === "unknown" ? <span className="pill neutral">External calendar block: dates only</span> : <span className="pill ok">Counted in Finance</span>}
      </div>
      <dl className="sd-rows box">
        <div><dt>Listing</dt><dd>{placeName(listings, r.property_id)}</dd></div>
        {r.eff_kind === "reservation" && (
          <div><dt>Guest</dt><dd>
            <GuestCell name={r.guest_name || ""} source={r.guest_name_source} site={site} phone={r.phone_last4} />
            {r.guest_name_source === "manual" && r.guest_name_at && <div className="hint">Entered{r.guest_name_by_name ? ` by ${r.guest_name_by_name}` : ""} on {when(r.guest_name_at)}</div>}
          </dd></div>
        )}
        <div><dt>Dates</dt><dd>{fmtDate(r.check_in)} → {fmtDate(r.check_out)} · {nightsBetween(r.check_in, r.check_out)} nights</dd></div>
        {r.eff_kind === "reservation" && <div><dt>Details</dt><dd><DetailsCell id={r.id} channel={r.channel} site={site} name={r.guest_name || ""} refCode={r.external_ref || ""} /></dd></div>}
        {r.eff_kind === "unknown" && r.status === "confirmed" && (
          <div><dt>Status</dt><dd>
            <BlockStatus id={r.id} site={site} summary={r.summary} back={`/host/bookings/other-sites/${r.id}`} />
            <DetailsCell id={r.id} channel={r.channel} site={site} name={r.guest_name || ""} refCode={r.external_ref || ""} block />
          </dd></div>
        )}
        <div><dt>Came from</dt><dd>{r.source === "ical" ? `${r.feed_name || site} calendar link` : r.source === "import" ? "Payout file import" : "Added by hand"}{r.summary ? ` · "${r.summary}"` : ""}</dd></div>
        {r.source === "ical" && (
          <div><dt>What {site} sent</dt><dd>
            <div className="feed-raw"><b>Title:</b> {r.summary || "(empty)"}{r.feed_detail ? <><br /><b>Description:</b> {r.feed_detail}</> : <><br /><b>Description:</b> (none)</>}</div>
            <div className="hint">Exactly what the {site} calendar link contains for this stay, refreshed with every sync. Anything not here has to come from a payout file or be typed in.</div>
          </dd></div>
        )}
        {r.source === "ical" && <div><dt>History</dt><dd>First seen {when(r.first_seen_at)} · last seen {when(r.last_seen_at)}{r.modified_at ? ` · dates changed ${when(r.modified_at)}` : ""}{r.cancelled_at ? ` · cancelled ${when(r.cancelled_at)}` : ""}</dd></div>}
      </dl>
      <p className="notice info" data-testid="external-readonly"><span><b>Read-only.</b> This {r.eff_kind === "reservation" ? "reservation" : "calendar block"} comes from {site}, so it can&apos;t be edited, cancelled or deleted on Sevgio. Make changes on {site}; Sevgio picks them up at the next refresh. Guest messaging isn&apos;t connected for {site}: reply in the {site} app.</span></p>
      <div className="box">
        <h3>Payout details</h3>
        {EXTERNAL_NOTES_EDITABLE ? <ChannelResForm v={r} /> : (
          <>
            <dl className="sd-rows">
              {([["Rent", r.rent_cents], ["Cleaning", r.cleaning_cents], ["Other", r.other_cents], ["Tax", r.tax_cents], ["Commission", r.commission_cents], ["Refund", r.refund_cents],
                ["Expected payout", r.expected_payout_cents], ["Received payout", r.received_payout_cents]] as const).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v == null ? <span className="muted">Not provided by {site}</span> : money(v)}</dd></div>
              ))}
              <div><dt>Payout date</dt><dd>{r.payout_date ? fmtDate(r.payout_date) : <span className="muted">Not provided by {site}</span>}</dd></div>
            </dl>
            <p className="hint">Amounts come from the payout file you import from {site} (<Link href="/host/finance/import">Finance → Import</Link>).</p>
          </>
        )}
      </div>
    </div>
  );
}

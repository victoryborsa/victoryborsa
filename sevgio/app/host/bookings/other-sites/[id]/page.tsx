import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth.ts";
import { one } from "@/lib/db.ts";
import { fmtDate, nightsBetween } from "@/lib/dates.ts";
import { financeListings, placeName } from "@/lib/finance.ts";
import { channelLabel } from "@/lib/channels.ts";
import { Flash } from "@/components/Flash.tsx";
import { ChannelResForm, type ChannelResValues } from "@/components/ChannelResForm.tsx";
import { deleteChannelResAction, setManualStatusAction } from "@/app/actions/channel.ts";

type Res = ChannelResValues & { id: string; property_id: string; channel: string; source: string; status: string; eff_kind: string; check_in: string; check_out: string; summary: string;
  feed_name: string | null; first_seen_at: string; last_seen_at: string; modified_at: string | null; cancelled_at: string | null; finance_source: string };

const when = (t: string) => new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

export default async function OtherSiteReservation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params;
  const u = await requireUser(["host", "admin"], `/host/bookings/other-sites/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await one<Res>(`SELECT c.*, f.name AS feed_name FROM channel_stays c LEFT JOIN ical_feeds f ON f.id = c.feed_id WHERE c.id = $1`, [id]);
  const listings = await financeListings(u);
  if (!r || !listings.some(l => l.id === r.property_id)) notFound();
  const site = channelLabel(r.channel);
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 820 }}>
      <Flash msg={(await searchParams).msg} />
      <p><Link href="/host/bookings/other-sites">‹ Other sites</Link></p>
      <div className="row" style={{ alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>{site} {r.eff_kind === "reservation" ? "reservation" : r.eff_kind === "unknown" ? "period" : "blocked dates"}{r.external_ref ? ` ${r.external_ref}` : ""}</h2>
        {r.status === "cancelled" ? <span className="pill danger">Cancelled</span> : r.eff_kind === "mirror" ? <span className="pill neutral">Copy of another booking (not counted)</span>
          : r.eff_kind === "unknown" ? <span className="pill warn">Unclear: reservation or closed?</span> : <span className="pill ok">Counted in Finance</span>}
      </div>
      <dl className="sd-rows box">
        <div><dt>Listing</dt><dd>{placeName(listings, r.property_id)}</dd></div>
        <div><dt>Dates</dt><dd>{fmtDate(r.check_in)} → {fmtDate(r.check_out)} · {nightsBetween(r.check_in, r.check_out)} nights</dd></div>
        <div><dt>Came from</dt><dd>{r.source === "ical" ? `${r.feed_name || site} calendar link` : r.source === "import" ? "Payout file import" : "Added by hand"}{r.summary ? ` · "${r.summary}"` : ""}</dd></div>
        {r.source === "ical" && <div><dt>History</dt><dd>First seen {when(r.first_seen_at)} · last seen {when(r.last_seen_at)}{r.modified_at ? ` · dates changed ${when(r.modified_at)}` : ""}{r.cancelled_at ? ` · cancelled ${when(r.cancelled_at)}` : ""}</dd></div>}
      </dl>
      {r.source === "ical" && <p className="hint">The dates follow the {site} calendar. To change or cancel this stay, do it on {site}; Sevgio picks it up at the next refresh.</p>}
      <div className="box">
        <h3>Payout details</h3>
        <ChannelResForm v={r} />
      </div>
      {r.source !== "ical" && (
        <div className="row">
          <form action={setManualStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={r.status === "cancelled" ? "confirmed" : "cancelled"} />
            <button className="btn btn-ghost">{r.status === "cancelled" ? "Reinstate" : "Mark as cancelled"}</button></form>
          <form action={deleteChannelResAction}><input type="hidden" name="id" value={r.id} /><button className="btn btn-danger">Delete</button></form>
        </div>
      )}
    </div>
  );
}

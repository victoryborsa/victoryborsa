import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth.ts";
import { one } from "@/lib/db.ts";
import { expireStaleRequests, type Booking } from "@/lib/bookings.ts";
import { addDays, fmtDate, todayLocal } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";
import { CANCELLATION } from "@/lib/constants.ts";
import { photoUrl } from "@/lib/queries.ts";
import { getSettings } from "@/lib/settings.ts";
import { Flash } from "@/components/Flash.tsx";
import { StatusPill } from "@/components/ui.tsx";
import { partyLabel } from "@/lib/party.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { guestCancelAction } from "@/app/actions/bookings.ts";

export const metadata: Metadata = { title: "Your booking", robots: { index: false } };
export const dynamic = "force-dynamic";

type Row = Booking & { title: string; slug: string; city: string; area: string; address: string; arrival_instructions: string; check_in_time: string; check_out_time: string; cancellation_policy: string; host_id: string; host_name: string; host_email: string; host_phone: string; cover_id: string | null };

export default async function TripPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ new?: string; msg?: string }> }) {
  const { code } = await params;
  const sp = await searchParams;
  const isNew = sp.new === "1";
  const u = await requireUser(undefined, `/trips/${code}`);
  await expireStaleRequests();
  const b = await one<Row>(
    `SELECT b.*, p.title, p.slug, p.city, p.area, p.address, p.arrival_instructions, p.check_in_time, p.check_out_time, p.cancellation_policy, p.host_id,
            h.name AS host_name, h.email AS host_email, h.phone AS host_phone,
            (SELECT id FROM photos ph WHERE ph.property_id = p.id ORDER BY position LIMIT 1) AS cover_id
     FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users h ON h.id = p.host_id WHERE b.code = $1`,
    [code.toUpperCase()],
  );
  // Only the guest, the listing's host, or an admin may see a booking.
  if (!b || !(b.guest_id === u.id || b.host_id === u.id || u.role === "admin")) notFound();
  const settings = await getSettings();
  const confirmed = b.status === "confirmed";
  const today = todayLocal();
  const canCancel = b.guest_id === u.id && ["pending", "confirmed"].includes(b.status) && b.check_in >= today;
  const steps: Record<string, string[]> = {
    pending: ["The host reviews your request, usually within a few hours (48 hours at most).", "If they accept, you'll get a confirmation email with the address.", "If they decline or don't reply in time, the dates are released and nothing is owed."],
    confirmed: [settings.payment_note, `Check-in instructions are shown below and emailed to you. Arrive after ${b.check_in_time} on ${fmtDate(b.check_in)}.`, `Check out before ${b.check_out_time} on ${fmtDate(b.check_out)}.`],
    declined: ["The host couldn't host you for these dates. Nothing is owed.", "Try other dates or a similar home nearby."],
    cancelled: ["This booking is cancelled. The dates are open to other guests again."],
    expired: ["The host didn't reply in time, so the request expired. Nothing is owed.", "Try again, or pick another home."],
  };
  return (
    <div className="wrap page-pad">
      <div className="crumbs" style={{ paddingTop: 0 }}><Link href="/trips">← My trips</Link></div>
      <div className="checkout-grid" style={{ paddingTop: 8 }}>
        <div className="box">
          <Flash msg={sp.msg} />
          {isNew && (
            <div className={`notice ${confirmed ? "ok" : "warn"}`} role="status">
              <div><b>{confirmed ? "You're booked!" : "Request sent to the host."}</b> {confirmed ? `A confirmation has been sent to ${u.email}.` : "Your dates are held while the host decides. We'll email you when they reply."}</div>
            </div>
          )}
          <div><span className="eyebrow">Booking reference</span><div className="code">{b.code}</div></div>
          <dl className="kv">
            <dt>Status</dt><dd><StatusPill status={b.status} /></dd>
            <dt>Home</dt><dd><Link href={`/stays/${b.slug}`}>{b.title}</Link>, {b.city}</dd>
            <dt>Dates</dt><dd>{fmtDate(b.check_in)} – {fmtDate(b.check_out)} ({b.nights} nights)</dd>
            <dt>Guests</dt><dd>{partyLabel(b)}</dd>
            <dt>Lead guest</dt><dd>{b.guest_name}, {b.guest_phone}</dd>
          </dl>
          <h3>What happens next</h3>
          <ol className="nextsteps">{(steps[b.status] || []).filter(Boolean).map((t, i) => <li key={i}><span>{t}</span></li>)}</ol>
          {confirmed && (
            <div className="box" style={{ background: "var(--surface-2)" }}>
              <h3>Getting there</h3>
              <p><b>Address:</b> {b.address || `${b.city}${b.area ? ", " + b.area : ""} (the host will send the exact address)`}</p>
              {b.arrival_instructions && <p className="prose">{b.arrival_instructions}</p>}
              <p><b>Your host:</b> {b.host_name} · {b.host_email}{b.host_phone ? ` · ${b.host_phone}` : ""}</p>
            </div>
          )}
          {b.host_note && <div className="notice info"><div><b>Note from the host:</b> {b.host_note}</div></div>}
          {canCancel && (
            <ActionForm action={guestCancelAction} confirmText="Cancel this booking? This can't be undone." className="stack">
              <input type="hidden" name="id" value={b.id} />
              <p className="hint">{b.status === "confirmed" ? CANCELLATION[b.cancellation_policy]?.text : "You can withdraw this request at any time before the host replies."}{b.status === "confirmed" && b.check_in <= addDays(today, 1) ? " Your check-in is very soon; please also call the host." : ""}</p>
              <div><SubmitButton className="btn btn-danger" pendingText="Cancelling…">{b.status === "pending" ? "Withdraw request" : "Cancel booking"}</SubmitButton></div>
            </ActionForm>
          )}
        </div>
        <aside className="box" style={{ alignSelf: "start" }}>
          <div style={{ borderRadius: "var(--r)", overflow: "hidden", aspectRatio: "4/3" }}>{b.cover_id ? <img src={photoUrl(b.cover_id, "thumb")} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div className="noph" />}</div>
          <table className="breakdown">
            <tbody>
              <tr><td>{money(b.nightly_price_cents)} × {b.nights} nights</td><td>{money(b.lodging_cents)}</td></tr>
              {b.discount_cents > 0 && <tr><td>Length-of-stay discount</td><td>−{money(b.discount_cents)}</td></tr>}
              {b.cleaning_fee_cents > 0 && <tr><td>Cleaning fee</td><td>{money(b.cleaning_fee_cents)}</td></tr>}
              {b.tax_cents > 0 && <tr><td>Taxes</td><td>{money(b.tax_cents)}</td></tr>}
              <tr className="total"><td>Total</td><td>{money(b.total_cents)}</td></tr>
            </tbody>
          </table>
          <p className="hint">Questions? <Link href="/contact">Contact us</Link> and include your reference {b.code}.</p>
        </aside>
      </div>
    </div>
  );
}

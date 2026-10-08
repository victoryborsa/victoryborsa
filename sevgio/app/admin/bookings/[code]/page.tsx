import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser, safeNext } from "@/lib/auth.ts";
import { one, q } from "@/lib/db.ts";
import { expireStaleRequests, unavailableNights, type Booking } from "@/lib/bookings.ts";
import { EditResDates } from "@/components/EditResDates.tsx";
import { addDays, fmtDate, fmtWhen, type Instant } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";
import { partyLabel } from "@/lib/party.ts";
import { mailUrl, telUrl } from "@/lib/links.ts";
import { METHOD_LABEL, methodLabel, paysAtProperty } from "@/lib/payment-rules.ts";
import { localNow } from "@/lib/booking-ref.ts";
import { Flash } from "@/components/Flash.tsx";
import { StatusPill } from "@/components/ui.tsx";
import { CopyButton } from "@/components/CopyButton.tsx";
import { PaymentPill, PriceBreakdown } from "@/components/booking-summary.tsx";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { decideBookingAction, editReservationAction, markPaidAction, markRefundedAction } from "@/app/actions/host.ts";
import { sendPaymentLinkAction } from "@/app/actions/bookings.ts";
import { getSettings } from "@/lib/settings.ts";
import { onlineMethods } from "@/lib/payments.ts";
import { canPayBalance } from "@/lib/payment-flow.ts";

export const metadata: Metadata = { title: "Reservation", robots: { index: false } };
export const dynamic = "force-dynamic";

type Row = Booking & { title: string; slug: string; city: string; address: string; check_in_time: string; check_out_time: string; property_id: string;
  guest_email: string; guest_account_phone: string; host_name: string; host_email: string; updated_at: string };
type Pay = { method: string; amount_cents: number; status: string; note: string; created_at: string; recorded_by_name: string | null };

const when = (t: Instant) => fmtWhen(t);
const PAY_STATUS: Record<string, string> = { pending: "Started", processing: "Processing", succeeded: "Received", failed: "Failed" };

/** Everything about one Sevgio.com reservation for admins, opened from the reservation search. */
export default async function AdminReservation({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ back?: string; msg?: string }> }) {
  const { code } = await params;
  const sp = await searchParams;
  await requireUser(["admin"], `/admin/bookings/${code}`);
  await expireStaleRequests();
  const b = await one<Row>(
    `SELECT b.*, p.title, p.slug, p.city, p.address, p.check_in_time, p.check_out_time, g.email AS guest_email, g.phone AS guest_account_phone,
            h.name AS host_name, h.email AS host_email
     FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.guest_id JOIN users h ON h.id = p.host_id
     WHERE b.code = $1`,
    [code.toUpperCase()],
  );
  if (!b) notFound();
  const payments = await q<Pay>(
    `SELECT pm.method, pm.amount_cents, pm.status, pm.note, pm.created_at, u.name AS recorded_by_name
     FROM payments pm LEFT JOIN users u ON u.id = pm.recorded_by WHERE pm.booking_id = $1 ORDER BY pm.created_at`, [b.id]);
  const now = localNow(), today = now.date;
  const back = safeNext(sp.back, "/admin/bookings");
  const self = `/admin/bookings/${b.code}${sp.back ? `?back=${encodeURIComponent(back)}` : ""}`;
  const canPay = ["awaiting_payment", "confirmed"].includes(b.status) && b.paid_cents < b.total_cents && b.payment_status !== "processing"
    && !(b.status === "awaiting_payment" && (b.payment_method === "card" || b.payment_method === "ach"));
  const canCancel = ["awaiting_payment", "confirmed"].includes(b.status) && b.check_out >= today;
  const canEdit = ["pending", "awaiting_payment", "confirmed"].includes(b.status);
  const canSendPayLink = canPayBalance(b) && onlineMethods(await getSettings()).length > 0;
  const canRefund = ["cancelled", "declined", "expired"].includes(b.status) && b.paid_cents > 0 && b.payment_status !== "refunded";
  const taken = canEdit ? await unavailableNights(b.property_id, b.check_in < today ? b.check_in : today, addDays(today, 3 * 366), undefined, b.id) : [];
  return (
    <div className="stack rd" style={{ gap: 16 }}>
      <p><Link href={back}>‹ Back to {back.includes("q=") || back.includes("when=") ? "search results" : "Bookings"}</Link></p>
      <Flash msg={sp.msg} />
      <header className="rd-head box">
        <div>
          <span className="eyebrow">Booking reference</span>
          <div className="row" style={{ gap: 10, alignItems: "center" }}><h2 className="code ref-code" style={{ margin: 0 }} data-testid="booking-ref">{b.code}</h2><CopyButton value={b.code} /></div>
          <p className="rd-who"><b>{b.guest_name}</b> · {b.title} · {fmtDate(b.check_in)} - {fmtDate(b.check_out)}</p>
        </div>
        <div className="rd-pills">
          <StatusPill b={b} />
          <PaymentPill b={b} />
        </div>
        {(canPay || canSendPayLink) && (
          <div className="row rd-pay" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-start" }} data-testid="quick-pay">
            {canPay && (
              <details className="rd-act">
                <summary className="btn btn-primary btn-sm">Mark as paid</summary>
                <ActionForm action={markPaidAction} className="stack" confirmText="Record this payment?">
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="back" value={self} />
                  <label className="field"><span>Amount received</span><input className="input mono" name="amount" inputMode="decimal" defaultValue={((b.status === "awaiting_payment" ? b.due_now_cents - b.paid_cents : b.total_cents - b.paid_cents) / 100).toFixed(2)} /></label>
                  <label className="field"><span>Paid by</span>
                    <select className="input" name="method" defaultValue={!b.payment_method || paysAtProperty(b) ? "cash" : b.payment_method}>
                      <option value="cash">Cash</option><option value="zelle">Zelle</option><option value="venmo">Venmo</option><option value="card">Card</option><option value="ach">Bank transfer</option>
                    </select>
                  </label>
                  <div><SubmitButton className="btn btn-primary">Save payment</SubmitButton></div>
                </ActionForm>
              </details>
            )}
            {canSendPayLink && (
              <ActionForm action={sendPaymentLinkAction} confirmText={`Email ${b.guest_name} a link to pay ${money(b.total_cents - b.paid_cents)} online?`}>
                <input type="hidden" name="id" value={b.id} />
                <SubmitButton className="btn btn-ghost btn-sm" pendingText="Sending…">Email payment link</SubmitButton>
              </ActionForm>
            )}
          </div>
        )}
        <div className="row rd-links">
          <Link className="btn btn-ghost btn-sm" href={`/trips/${b.code}/invoice`}>Invoice</Link>
          <Link className="btn btn-ghost btn-sm" href={`/trips/${b.code}`}>Guest's confirmation page</Link>
          <Link className="btn btn-ghost btn-sm" href={`/admin/calendar?view=week&start=${b.check_in}`}>Show in calendar</Link>
        </div>
      </header>

      <div className="rd-grid">
        <section className="box" aria-labelledby="rd-stay">
          <h3 id="rd-stay">Stay</h3>
          <dl className="kv">
            <dt>Property</dt><dd><Link href={`/stays/${b.slug}`}>{b.title}</Link><div className="hint" style={{ fontWeight: 400 }}>{b.address || b.city}</div></dd>
            <dt>Check-in</dt><dd>{fmtDate(b.check_in)} <span className="muted" style={{ fontWeight: 400 }}>after {b.check_in_time}{b.arrival_time ? ` · arriving ${b.arrival_time}` : ""}</span></dd>
            <dt>Check-out</dt><dd>{fmtDate(b.check_out)} <span className="muted" style={{ fontWeight: 400 }}>by {b.check_out_time}</span></dd>
            <dt>Nights</dt><dd>{b.nights}</dd>
            <dt>Guests</dt><dd>{partyLabel(b)}{b.pets > 0 ? ` · ${b.pets} pet${b.pets === 1 ? "" : "s"}` : ""}</dd>
            <dt>Host</dt><dd>{b.host_name} <span className="muted" style={{ fontWeight: 400 }}>{b.host_email}</span></dd>
            <dt>Booked</dt><dd>{when(b.created_at)}</dd>
            <dt>Last change</dt><dd>{when(b.updated_at)}</dd>
            {b.cancelled_by && <><dt>Cancelled by</dt><dd>{b.cancelled_by === "admin" ? "Admin" : b.cancelled_by === "host" ? "Host" : "Guest"}</dd></>}
          </dl>
        </section>

        <section className="box" aria-labelledby="rd-guest">
          <h3 id="rd-guest">Guest</h3>
          <dl className="kv">
            <dt>Name</dt><dd>{b.guest_name}</dd>
            <dt>Email</dt><dd><a href={mailUrl(b.guest_email)}>{b.guest_email}</a></dd>
            <dt>Phone</dt><dd>{b.guest_phone ? <a href={telUrl(b.guest_phone)}>{b.guest_phone}</a> : b.guest_account_phone || "Not given"}</dd>
          </dl>
          {b.message && <p className="rd-note"><b>Guest's message:</b> “{b.message}”</p>}
          {b.host_note && <p className="rd-note"><b>Note to the guest:</b> {b.host_note}</p>}
        </section>

        <section className="box" aria-labelledby="rd-pay">
          <h3 id="rd-pay">Price and payment</h3>
          <PriceBreakdown b={b} />
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>Payment</dt><dd><PaymentPill b={b} /></dd>
            <dt>Method</dt><dd>{b.payment_method ? methodLabel(b) : "Not collected online"}</dd>
            {b.paid_cents < b.total_cents && b.paid_cents > 0 && <><dt>Still to collect</dt><dd>{money(b.total_cents - b.paid_cents)}</dd></>}
            {b.paid_cents === 0 && paysAtProperty(b) && b.status === "confirmed" && <><dt>Amount due</dt><dd>{money(b.total_cents)}</dd></>}
            {b.payment_deadline && b.status === "awaiting_payment" && <><dt>Pay by</dt><dd>{when(b.payment_deadline)} ET</dd></>}
            {b.security_deposit_cents > 0 && <><dt>Security deposit</dt><dd>{money(b.security_deposit_cents)} <span className="muted" style={{ fontWeight: 400 }}>collected separately</span></dd></>}
          </dl>
          {payments.length > 0 && (
            <div className="tbl-wrap" style={{ marginTop: 12 }}>
              <table className="tbl">
                <thead><tr><th>Date</th><th>Method</th><th className="num">Amount</th><th>Status</th></tr></thead>
                <tbody>{payments.map((pm, i) => (
                  <tr key={i}><td>{when(pm.created_at)}{pm.recorded_by_name && <div className="hint">Recorded by {pm.recorded_by_name}</div>}</td><td>{pm.method === "cash" ? "Cash" : METHOD_LABEL[pm.method as keyof typeof METHOD_LABEL] || pm.method}{pm.note && <div className="hint">{pm.note}</div>}</td><td className="num">{money(pm.amount_cents)}</td><td>{PAY_STATUS[pm.status] || pm.status}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        {(b.status === "pending" || canPay || canSendPayLink || canCancel || canEdit || canRefund) && (
          <section className="box" aria-labelledby="rd-act">
            <h3 id="rd-act">Actions</h3>
            {b.status === "pending" && (
              <ActionForm action={decideBookingAction} className="stack">
                <input type="hidden" name="id" value={b.id} />
                <input type="hidden" name="back" value={self} />
                <input className="input" name="note" placeholder="Optional note to the guest" aria-label="Note to the guest" />
                <div className="row" style={{ gap: 8 }}>
                  <SubmitButton className="btn btn-primary" name="decision" value="accept">Accept request</SubmitButton>
                  <SubmitButton className="btn btn-danger" name="decision" value="decline">Decline</SubmitButton>
                </div>
              </ActionForm>
            )}
            {canPay && (
              <details className="rd-act">
                <summary className="btn btn-ghost">Mark payment received</summary>
                <ActionForm action={markPaidAction} className="stack" confirmText="Record this payment and confirm the booking?">
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="back" value={self} />
                  <label className="field"><span>Amount received</span><input className="input mono" name="amount" defaultValue={((b.status === "awaiting_payment" ? b.due_now_cents - b.paid_cents : b.total_cents - b.paid_cents) / 100).toFixed(2)} /></label>
                  <label className="field"><span>Paid by</span>
                    <select className="input" name="method" defaultValue={b.payment_method === "cash" && b.status === "awaiting_payment" ? "zelle" : b.payment_method || "zelle"}>
                      <option value="zelle">Zelle</option><option value="venmo">Venmo</option><option value="cash">Cash</option><option value="card">Card</option><option value="ach">Bank transfer</option>
                    </select>
                  </label>
                  <div><SubmitButton className="btn btn-primary">Record payment</SubmitButton></div>
                </ActionForm>
              </details>
            )}
            {canSendPayLink && (
              <ActionForm action={sendPaymentLinkAction} className="rd-act" confirmText={`Email ${b.guest_name} a link to pay ${money(b.total_cents - b.paid_cents)} online?`}>
                <input type="hidden" name="id" value={b.id} />
                <SubmitButton className="btn btn-ghost" pendingText="Sending…">Email payment link</SubmitButton>
              </ActionForm>
            )}
            {canEdit && (
              <details className="rd-act">
                <summary className="btn btn-ghost">Edit reservation</summary>
                <ActionForm action={editReservationAction} className="stack">
                  <input type="hidden" name="id" value={b.id} />
                  <EditResDates today={today} taken={taken} ci={b.check_in} co={b.check_out} />
                  <label className="field"><span>Guest name</span><input className="input" name="name" defaultValue={b.guest_name} required /></label>
                  <div className="grid-2">
                    <label className="field"><span>Phone number</span><input className="input" name="phone" type="tel" defaultValue={b.guest_phone} /></label>
                    <label className="field"><span>Number of guests</span><input className="input" name="guests" type="number" min={1} max={50} defaultValue={b.guests} required /></label>
                  </div>
                  <label className="field"><span>Total price <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></span><input className="input mono" name="total" inputMode="decimal" placeholder={(b.total_cents / 100).toFixed(2)} />
                    <span className="hint">Leave empty to keep the agreed nightly rate: the total follows the number of nights. Fill it in to set the total yourself.</span></label>
                  <label className="row" style={{ gap: 8 }}><input type="checkbox" name="notify" value="1" defaultChecked /><span>Email the guest what changed</span></label>
                  <input type="hidden" name="notify" value="0" />
                  <div><SubmitButton className="btn btn-primary" pendingText="Checking dates and saving…">Save changes</SubmitButton></div>
                </ActionForm>
                <p className="hint">New dates are checked against every booking and blocked night on Sevgio, Airbnb, Booking.com, Vrbo and calendar links, so an edit can&apos;t double-book.</p>
              </details>
            )}
            {canRefund && (
              <ActionForm action={markRefundedAction} className="stack" confirmText={`Mark ${money(b.paid_cents)} as returned to the guest?`}>
                <input type="hidden" name="id" value={b.id} />
                <div><SubmitButton className="btn btn-ghost">Mark refunded</SubmitButton></div>
              </ActionForm>
            )}
            {canCancel && (
              <details className="rd-act">
                <summary className="btn btn-ghost">Cancel booking…</summary>
                <ActionForm action={decideBookingAction} className="stack" confirmText="Cancel this booking? The guest will be emailed.">
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="back" value={self} />
                  <input type="hidden" name="decision" value="cancel" />
                  <label className="field"><span>Reason (sent to the guest)</span><input className="input" name="note" /></label>
                  <div><SubmitButton className="btn btn-danger">Cancel booking</SubmitButton></div>
                </ActionForm>
                <p className="hint">The booking reference {b.code} stays the same after a cancellation.</p>
              </details>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

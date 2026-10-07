import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth.ts";
import { one } from "@/lib/db.ts";
import { expireStaleRequests, unavailableNights, type Booking } from "@/lib/bookings.ts";
import { EditResDates } from "@/components/EditResDates.tsx";
import { addDays, fmtDate, todayLocal, fmtWhen } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";
import { CANCELLATION, placeFull } from "@/lib/constants.ts";
import { photoUrl } from "@/lib/queries.ts";
import { getSettings } from "@/lib/settings.ts";
import { forListing, onlineMethods } from "@/lib/payments.ts";
import { cardFee } from "@/lib/payment-rules.ts";
import { canPayBalance } from "@/lib/payment-flow.ts";
import { paymentLater } from "@/lib/statuses.ts";
import { directionsUrl, mailUrl, telUrl } from "@/lib/links.ts";
import { Flash } from "@/components/Flash.tsx";
import { StatusPill } from "@/components/ui.tsx";
import { partyLabel } from "@/lib/party.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { CopyButton } from "@/components/CopyButton.tsx";
import { PaymentPill, PriceBreakdown } from "@/components/booking-summary.tsx";
import { KEEP_REFERENCE } from "@/lib/booking-ref.ts";
import { guestCancelAction, guestChangeDatesAction, payBalanceAction, payNowAction } from "@/app/actions/bookings.ts";

export const metadata: Metadata = { title: "Your booking", robots: { index: false } };
export const dynamic = "force-dynamic";

type Row = Booking & { title: string; slug: string; city: string; area: string; address: string; arrival_instructions: string; check_in_time: string; check_out_time: string; cancellation_policy: string; host_id: string; host_name: string; host_email: string; host_phone: string; cover_id: string | null; owner_zelle: string; owner_venmo: string };

export default async function TripPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ new?: string; msg?: string; paid?: string; payerror?: string }> }) {
  const { code } = await params;
  const sp = await searchParams;
  const isNew = sp.new === "1";
  const u = await requireUser(undefined, `/trips/${code}`);
  await expireStaleRequests();
  const b = await one<Row>(
    `SELECT b.*, p.title, p.slug, p.city, p.area, p.address, p.arrival_instructions, p.check_in_time, p.check_out_time, p.cancellation_policy, p.host_id, p.owner_zelle, p.owner_venmo,
            h.name AS host_name, h.email AS host_email, h.phone AS host_phone,
            (SELECT id FROM photos ph WHERE ph.property_id = p.id ORDER BY position LIMIT 1) AS cover_id
     FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users h ON h.id = p.host_id WHERE b.code = $1`,
    [code.toUpperCase()],
  );
  // Only the guest, the listing's host, or an admin may see a booking.
  if (!b || !(b.guest_id === u.id || b.host_id === u.id || u.role === "admin")) notFound();
  const settings = forListing(await getSettings(), b);
  const confirmed = b.status === "confirmed";
  const today = todayLocal();
  const online = onlineMethods(settings);
  const balance = b.total_cents - b.paid_cents;
  // Every unpaid confirmed booking gets a Pay now box: Stripe buttons when card / bank transfer is on, Zelle / Venmo details when set.
  const payNow = b.guest_id === u.id && canPayBalance(b);
  const manualPay = [settings.pay_zelle && settings.zelle_to && { label: "Zelle", to: settings.zelle_to }, settings.pay_venmo && settings.venmo_handle && { label: "Venmo", to: settings.venmo_handle }].filter((x): x is { label: string; to: string } => !!x);
  const later = paymentLater(b, payNow && (online.length > 0 || manualPay.length > 0));
  const canChange = b.guest_id === u.id && b.status === "confirmed" && b.check_out > today;
  const taken = canChange ? await unavailableNights(b.property_id, b.check_in < today ? b.check_in : today, addDays(today, 540), undefined, b.id) : [];
  const canCancel = b.guest_id === u.id && ["pending", "awaiting_payment", "confirmed"].includes(b.status) && b.check_in >= today;
  const steps: Record<string, string[]> = {
    pending: ["The host reviews your request, usually within a few hours (48 hours at most).", "If they accept, you'll get a confirmation email with the address.", "If they decline or don't reply in time, the dates are released and nothing is owed."],
    confirmed: [later, `Check-in instructions are shown below and emailed to you. Arrive after ${b.check_in_time} on ${fmtDate(b.check_in)}.`, `Check out before ${b.check_out_time} on ${fmtDate(b.check_out)}.`],
    declined: ["The host couldn't host you for these dates. Nothing is owed.", "Try other dates or a similar home nearby."],
    cancelled: ["This booking is cancelled. The dates are open to other guests again."],
    expired: [b.payment_method ? "The booking wasn't paid in time, so it expired and the dates were released." : "The host didn't reply in time, so the request expired. Nothing is owed.", "Try again, or pick another home."],
    awaiting_payment: ["Complete your payment below to confirm the booking.", "Once it's paid, you'll get a confirmation email with the address and arrival details."],
  };
  return (
    <div className="wrap page-pad theme-light acct">
      <div className="crumbs" style={{ paddingTop: 0 }}><Link href="/trips">← My trips</Link></div>
      <div className="checkout-grid" style={{ paddingTop: 8 }}>
        <div className="box">
          <Flash msg={sp.msg} />
          {sp.paid === "1" && (b.status === "awaiting_payment" || (payNow && online.length > 0)) && <div className="notice info" role="status">Thanks! We're confirming your payment with Stripe. Refresh this page in a moment.</div>}
          {sp.payerror === "1" && <div className="notice error" role="alert">We couldn't open the payment page. Your dates are held. Try the Pay button below, or contact us.</div>}
          {b.status === "awaiting_payment" && b.guest_id === u.id && (
            <div className="box" style={{ borderColor: "var(--warn)" }}>
              <h3>Payment needed to confirm</h3>
              <p><b>Due now: {money(b.due_now_cents)}</b>{b.payment_method === "cash" ? ` deposit. The remaining ${money(b.total_cents - b.due_now_cents)} is paid in cash at check-in.` : ""}{b.card_fee_cents > 0 ? ` (includes a ${money(b.card_fee_cents)} card processing fee)` : ""}</p>
              {b.payment_deadline && <p className="hint">Please pay by {fmtWhen(b.payment_deadline)} ET. After that the booking is cancelled and the dates are released.</p>}
              {b.payment_method === "card" || b.payment_method === "ach" ? (
                <ActionForm action={payNowAction}><input type="hidden" name="id" value={b.id} /><div><SubmitButton pendingText="Opening secure payment…">{b.payment_method === "ach" ? "Pay by bank transfer" : "Pay by card"}</SubmitButton></div></ActionForm>
              ) : (
                <div className="stack" style={{ gap: 6 }}>
                  {(b.payment_method === "zelle" || (b.payment_method === "cash" && settings.zelle_to)) && <p><b>Zelle:</b> send to <span className="mono">{settings.zelle_to}</span></p>}
                  {(b.payment_method === "venmo" || (b.payment_method === "cash" && settings.venmo_handle)) && <p><b>Venmo:</b> send to <span className="mono">{settings.venmo_handle}</span></p>}
                  <p>Put <b className="mono">{b.code}</b> in the payment note. Your host confirms the booking as soon as it arrives.</p>
                </div>
              )}
            </div>
          )}
          {payNow && (
            <section className="box" style={{ borderColor: "var(--accent, var(--warn))" }} aria-labelledby="paynow-h" data-testid="pay-now">
              <h3 id="paynow-h">Pay now</h3>
              <p><b>Amount due: {money(balance)}</b>{b.paid_cents > 0 ? ` (${money(b.paid_cents)} already paid)` : ""}</p>
              {online.length > 0 && <>
                <p className="hint">Pay securely online through Stripe now, or pay at the property when you arrive. Card details never reach Sevgio.</p>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {online.map(m => (
                    <ActionForm key={m} action={payBalanceAction}>
                      <input type="hidden" name="id" value={b.id} /><input type="hidden" name="method" value={m} />
                      <SubmitButton className={m === online[0] ? "btn btn-primary" : "btn btn-ghost"} pendingText="Opening secure payment…">
                        {m === "card" ? `Pay ${money(balance + cardFee(balance, settings.card_fee_percent, settings.card_fee_fixed_cents))} by card` : `Pay ${money(balance)} by bank transfer`}
                      </SubmitButton>
                    </ActionForm>
                  ))}
                </div>
                {online.includes("card") && cardFee(balance, settings.card_fee_percent, settings.card_fee_fixed_cents) > 0 && <p className="hint">Card payments include a {money(cardFee(balance, settings.card_fee_percent, settings.card_fee_fixed_cents))} processing fee.{online.includes("ach") ? " Bank transfer has no fee." : ""}</p>}
              </>}
              {manualPay.length > 0 && (
                <div className="stack" style={{ gap: 6 }}>
                  {online.length > 0 && <p className="hint">Or send it with no fee:</p>}
                  {manualPay.map(m => <p key={m.label}><b>{m.label}:</b> send {money(balance)} to <span className="mono">{m.to}</span></p>)}
                  <p className="hint">Put <b className="mono">{b.code}</b> in the payment note. Your host marks it paid when it arrives.</p>
                </div>
              )}
              {online.length === 0 && manualPay.length === 0 && (
                <>
                  <p className="hint">Online payment is being set up. To pay now, contact us and we'll send you a payment link, or pay at the property when you arrive.</p>
                  <div><Link className="btn btn-primary" href={`/contact?ref=${b.code}`}>Contact us to pay now</Link></div>
                </>
              )}
            </section>
          )}
          {isNew && (
            <div className={`notice ${confirmed ? "ok" : "warn"}`} role="status">
              <div><b>{confirmed ? "You're booked!" : b.status === "awaiting_payment" ? "Your dates are held." : "Request sent to the host."}</b> {confirmed ? `A confirmation has been sent to ${u.email}.` : b.status === "awaiting_payment" ? "Complete the payment below to confirm your booking. We've emailed you the details." : "Your dates are held while the host decides. We'll email you when they reply."}</div>
            </div>
          )}
          <section className="ref-card" aria-label="Booking reference">
            <div className="ref-card-top">
              <div><span className="eyebrow">Booking reference</span><div className="code ref-code" data-testid="booking-ref">{b.code}</div></div>
              <CopyButton value={b.code} />
            </div>
            <p className="ref-keep">{KEEP_REFERENCE}</p>
          </section>
          <dl className="kv">
            <dt>Status</dt><dd><StatusPill b={b} /></dd>
            <dt>Guest name</dt><dd>{b.guest_name}</dd>
            <dt>Property</dt><dd><Link href={`/stays/${b.slug}`}>{b.title}</Link>, {b.city}</dd>
            <dt>Check-in</dt><dd>{fmtDate(b.check_in)}<span className="muted" style={{ fontWeight: 400 }}> · after {b.check_in_time}</span></dd>
            <dt>Check-out</dt><dd>{fmtDate(b.check_out)}<span className="muted" style={{ fontWeight: 400 }}> · by {b.check_out_time} · {b.nights} night{b.nights === 1 ? "" : "s"}</span></dd>
            <dt>Guests</dt><dd>{partyLabel(b)}</dd>
            <dt>Total price</dt><dd>{money(b.total_cents + b.card_fee_cents)}</dd>
            <dt>Payment</dt><dd><PaymentPill b={b} /></dd>
            <dt>Phone</dt><dd><a href={telUrl(b.guest_phone)}>{b.guest_phone}</a></dd>
          </dl>
          <h3>What happens next</h3>
          <ol className="nextsteps">{(steps[b.status] || []).filter(Boolean).map((t, i) => <li key={i}><span>{t}</span></li>)}</ol>
          {confirmed && (
            <div className="box" style={{ background: "var(--surface-2)" }}>
              <h3>Getting there</h3>
              <p><b>Address:</b> {b.address ? <a href={directionsUrl(b.address)} target="_blank" rel="noopener noreferrer">📍 {b.address} · Directions ↗</a> : `${placeFull(b.city, b.area)} (the host will send the exact address)`}</p>
              {b.arrival_instructions && <p className="prose">{b.arrival_instructions}</p>}
              <p><b>Your host:</b> {b.host_name} · <a href={mailUrl(b.host_email)}>{b.host_email}</a>{b.host_phone ? <> · <a href={telUrl(b.host_phone)}>📞 {b.host_phone}</a></> : null}</p>
            </div>
          )}
          {b.host_note && <div className="notice info"><div><b>Note from the host:</b> {b.host_note}</div></div>}
          {canChange && (
            <details className="box" data-testid="change-dates">
              <summary className="btn btn-ghost">Change dates</summary>
              <div style={{ marginTop: 12 }}><ActionForm action={guestChangeDatesAction} className="stack">
                <input type="hidden" name="id" value={b.id} />
                <p className="hint">{b.check_in <= today ? "Your stay has started, so you can change your check-out date." : "Pick your new check-in and check-out dates."} Nights already booked by someone else can't be picked. Your total is worked out again at {money(b.nightly_price_cents)} a night, and you'll get an email with the new details.</p>
                <EditResDates today={today} taken={taken} ci={b.check_in} co={b.check_out} />
                <div><SubmitButton pendingText="Saving…">Save new dates</SubmitButton></div>
              </ActionForm></div>
            </details>
          )}
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
          <PriceBreakdown b={b} />
          {b.security_deposit_cents > 0 && <p className="hint">Refundable security deposit: <b>{money(b.security_deposit_cents)}</b>, collected by your host and returned after check-out. It isn't part of the total above.</p>}
          <p className="hint">Questions? <Link href="/contact">Contact us</Link> and include your reference {b.code}.</p>
          <p><Link className="btn btn-ghost btn-sm" href={`/trips/${b.code}/invoice`}>View or print invoice</Link></p>
        </aside>
      </div>
    </div>
  );
}

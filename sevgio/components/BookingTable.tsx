import { mailUrl, telUrl } from "@/lib/links.ts";
import { extrasOf } from "@/lib/party.ts";
import Link from "next/link";
import { fmtDate, fmtShort } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";
import { ActionForm, SubmitButton } from "./forms.tsx";
import { decideBookingAction, markPaidAction } from "@/app/actions/host.ts";
import { setKindAction } from "@/app/actions/channel.ts";
import type { Booking } from "@/lib/bookings.ts";
import { channelLabel } from "@/lib/channels.ts";
import { nightsBetween } from "@/lib/dates.ts";
import { stayPhase, type Phase } from "@/lib/booking-ref.ts";
import { Badge } from "./Badge.tsx";
import type { IconName } from "./Icon.tsx";
import { DetailsCell, GuestCell } from "./GuestNameForm.tsx";

const METHOD_SHORT: Record<string, string> = { card: "Card", ach: "Bank transfer", zelle: "Zelle", venmo: "Venmo", cash: "Cash + deposit" };
const PAY_LABEL: Record<string, string> = { none: "-", pending: "Waiting", processing: "Processing", paid: "Paid", deposit_paid: "Deposit paid", failed: "Failed" };
const PAY_TONE: Record<string, string> = { none: "neutral", pending: "warn", processing: "warn", paid: "ok", deposit_paid: "ok", failed: "danger" };

/** The listing's check-in and check-out times travel with each row, so "Staying now" starts and ends at the right hour. */
type Times = { check_in_time?: string; check_out_time?: string };
export type BookingRow = Booking & { title: string; guest_email: string; updated_at: string } & Times;

/** A reservation made on Airbnb, Booking.com, Vrbo or another site, shown in the same list as Sevgio bookings. */
export type PlatformRow = { id: string; channel: string; external_ref: string; guest_name: string; guest_name_source: string; place: string; check_in: string; check_out: string;
  guests: number | null; status: string; eff_kind: string; summary: string; phone_last4: string; expected_payout_cents: number | null; received_payout_cents: number | null;
  payout_date: string | null; updated_at: string } & Times;

export type LocalNow = { date: string; minutes: number };

/** When the stay is, in the listing's local time: kept apart from whether it's confirmed or paid. */
function Timing({ phase, checkIn, checkOut, today }: { phase: Phase; checkIn: string; checkOut: string; today: string }) {
  const t: [Parameters<typeof Badge>[0]["tone"], IconName, string] = phase === "past" ? ["neutral", "leave", "Checked out"]
    : phase === "current" ? ["ok", "key", checkOut === today ? "Checks out today" : "Staying now"]
    : phase === "upcoming" ? ["info", checkIn === today ? "arrive" : "calendar", checkIn === today ? "Arrives today" : "Upcoming"] : ["neutral", "none", "Not staying"];
  return <Badge tone={t[0]} icon={t[1]}>{t[2]}</Badge>;
}

const SEVGIO_STATUS: Record<string, [Parameters<typeof Badge>[0]["tone"], IconName, string]> = {
  confirmed: ["ok", "check", "Confirmed"], pending: ["warn", "wait", "Awaiting your answer"], awaiting_payment: ["warn", "wait", "Awaiting payment"],
  cancelled: ["danger", "cross", "Cancelled"], declined: ["danger", "cross", "Declined"], expired: ["neutral", "none", "Expired"],
};

/**
 * Bookings table for hosts and admins. Guest contact details appear only for active bookings.
 * With `platform`, reservations from other sites are listed alongside, in the same order (`order`). Each row keeps four things apart:
 * when the stay is, whether the booking is confirmed, whether it's paid, and whether its details (reference, guest name) are complete.
 */
export function BookingTable({ rows, today, now, back, showActions = true, fresh, detailBase = "/trips/", platform, order = "in-asc" }: { rows: BookingRow[]; today: string; now?: LocalNow; back: string;
  showActions?: boolean; fresh?: Set<string>; detailBase?: string; platform?: PlatformRow[]; order?: "in-asc" | "in-desc" | "updated-desc" }) {
  if (!rows.length && !platform?.length) return <div className="empty"><p className="muted">Nothing here yet.</p></div>;
  const site = !!platform;
  const phaseOf = (status: string, x: { check_in: string; check_out: string } & Times) =>
    stayPhase(status, x.check_in, x.check_out, today, now && { minutes: now.minutes, checkInTime: x.check_in_time, checkOutTime: x.check_out_time });
  const key = (x: { check_in: string; updated_at: string }) => (order === "updated-desc" ? String(x.updated_at) : x.check_in);
  const items = [...rows.map(b => ({ b, r: null as PlatformRow | null, k: key(b) })), ...(platform || []).map(r => ({ b: null as BookingRow | null, r, k: key(r) }))]
    .sort((x, y) => (order === "in-asc" ? (x.k < y.k ? -1 : x.k > y.k ? 1 : 0) : (x.k > y.k ? -1 : x.k < y.k ? 1 : 0)));
  return (
    <div className="tbl-wrap">
      <table className={site ? "tbl bk-tbl" : "tbl"}>
        <thead><tr><th>Reservation</th><th>Guest</th><th>Stay</th><th>Booking</th><th>Payment</th>{site && <th>Details</th>}{showActions && <th><span className="sr-only">Actions</span></th>}</tr></thead>
        <tbody>
          {items.map(({ b, r }) => {
            if (r) {
              const label = channelLabel(r.channel), n = nightsBetween(r.check_in, r.check_out), phase = phaseOf(r.status, r);
              return (
                <tr key={"c" + r.id} data-platform={r.channel} data-phase={phase}>
                  <td data-label="Reservation">
                    <Link className="mono" href={`/host/bookings/other-sites/${r.id}`}>{r.external_ref || <span className="bk-noref">No reference</span>}</Link>
                    <div className="bk-site"><span className={`pill neutral ch-dot ch-${r.channel}`}>{label}</span></div>
                    <div className="bk-place">{r.place}</div>
                  </td>
                  <td data-label="Guest"><GuestCell name={r.guest_name} source={r.guest_name_source} site={label} phone={r.phone_last4} /></td>
                  <td data-label="Stay">
                    <div className="bk-dates">{fmtShort(r.check_in)} – {fmtShort(r.check_out)}</div>
                    <div className="hint">{n} night{n === 1 ? "" : "s"}{r.guests ? ` · ${r.guests} guest${r.guests === 1 ? "" : "s"}` : ""}</div>
                    {r.status !== "cancelled" && <Timing phase={phase} checkIn={r.check_in} checkOut={r.check_out} today={today} />}
                  </td>
                  <td data-label="Booking">
                    {r.status === "cancelled" ? <Badge tone="danger" icon="cross">Cancelled on {label}</Badge>
                      : r.eff_kind === "unknown" ? (
                        <div className="bk-check">
                          <Badge tone="warn" icon="question">Unconfirmed</Badge>
                          <p className="hint">{label} marks these dates “{r.summary || "unavailable"}”, the same as dates you closed. Is a guest staying?</p>
                          <div className="bk-check-actions">
                            {([["reservation", "Yes, a guest reservation"], ["blocked", "No, dates I closed"]] as const).map(([k, text]) => (
                              <form key={k} action={setKindAction}>
                                <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="kind" value={k} />
                                <button className="btn btn-ghost btn-sm">{text}</button>
                              </form>
                            ))}
                          </div>
                        </div>
                      ) : <Badge tone="ok" icon="check">Confirmed on {label}</Badge>}
                  </td>
                  <td data-label="Payment">
                    {r.received_payout_cents != null ? <><Badge tone="ok" icon="check">Payout received</Badge><div className="hint">{money(r.received_payout_cents)}{r.payout_date ? ` on ${fmtDate(r.payout_date, { month: "short", day: "numeric" })}` : ""}</div></>
                      : r.expected_payout_cents != null ? <><Badge tone="warn" icon="wait">Payout not received</Badge><div className="hint">{money(r.expected_payout_cents)} expected from {label}</div></>
                      : <><Badge tone="neutral" icon="info">Payment status unavailable</Badge><div className="hint">Calendar links don&apos;t include payments. <Link href={`/host/bookings/other-sites/${r.id}`}>Add payout</Link></div></>}
                  </td>
                  <td data-label="Details"><DetailsCell id={r.id} channel={r.channel} site={label} name={r.guest_name} refCode={r.external_ref} /></td>
                  {showActions && <td data-label="" />}
                </tr>
              );
            }
            b = b!;
            const active = ["pending", "awaiting_payment", "confirmed"].includes(b.status) && b.check_out >= today;
            const phase = phaseOf(b.status, b), st = SEVGIO_STATUS[b.status] || ["neutral", "info", b.status];
            return (
              <tr key={b.id} className={fresh?.has(b.id) ? "row-new" : undefined} data-phase={phase}>
                <td data-label="Reservation">
                  <Link className="mono" href={`${detailBase}${b.code}`}>{b.code}</Link>{fresh?.has(b.id) && <span className="badge-new">New</span>}
                  {site && <div className="bk-site"><span className="pill neutral ch-dot ch-sevgio">Sevgio.com</span></div>}
                  <div className="bk-place">{b.title}</div>
                </td>
                <td data-label="Guest"><b className="gn-name">{b.guest_name}</b>{active && <div className="muted" style={{ fontSize: 13 }}><a href={telUrl(b.guest_phone)}>{b.guest_phone}</a> · <a href={mailUrl(b.guest_email)}>{b.guest_email}</a></div>}{b.message && <div className="hint" style={{ maxWidth: 280 }}>“{b.message}”</div>}</td>
                <td data-label="Stay">
                  <div className="bk-dates">{fmtShort(b.check_in)} – {fmtShort(b.check_out)}</div>
                  <div className="hint">{b.nights} night{b.nights === 1 ? "" : "s"} · {b.guests} guest{b.guests === 1 ? "" : "s"}{b.arrival_time ? ` · arrives ${b.arrival_time}` : ""}</div>
                  {phase !== "cancelled" && <Timing phase={phase} checkIn={b.check_in} checkOut={b.check_out} today={today} />}
                </td>
                <td data-label="Booking"><Badge tone={st[0]} icon={st[1]}>{st[2]}</Badge></td>
                <td data-label="Payment" style={{ minWidth: 190 }}>
                  <div className="bk-total">{money(b.total_cents)} total</div>
                  {extrasOf(b).length > 0 && <div className="hint">Extras: {extrasOf(b).map(x => x.name).join(", ")}{extrasOf(b).filter(x => x.details).map(x => <div key={x.key}>{x.name}: {x.details}</div>)}</div>}
                  {b.security_deposit_cents > 0 && <div className="hint">+ {money(b.security_deposit_cents)} deposit to collect</div>}
                  {b.payment_method ? (
                    <>
                      <div style={{ fontSize: 13 }}>{METHOD_SHORT[b.payment_method]} · <span className={`pill ${PAY_TONE[b.payment_status]}`}>{PAY_LABEL[b.payment_status]}</span></div>
                      {b.paid_cents > 0 && <div className="hint">Received {money(b.paid_cents)}{b.paid_cents < b.total_cents ? ` · ${money(b.total_cents - b.paid_cents)} to collect` : ""}</div>}
                      {showActions && ["awaiting_payment", "confirmed"].includes(b.status) && b.paid_cents < b.total_cents && b.payment_status !== "processing" && !(b.status === "awaiting_payment" && (b.payment_method === "card" || b.payment_method === "ach")) && (
                        <details>
                          <summary className="linkbtn" style={{ cursor: "pointer", fontSize: 13 }}>Mark payment received</summary>
                          <ActionForm action={markPaidAction} className="stack" confirmText="Record this payment and confirm the booking?">
                            <input type="hidden" name="id" value={b.id} />
                            <input type="hidden" name="back" value={back} />
                            <input className="input mono" name="amount" aria-label="Amount received" defaultValue={((b.status === "awaiting_payment" ? b.due_now_cents - b.paid_cents : b.total_cents - b.paid_cents) / 100).toFixed(2)} style={{ minHeight: 34, padding: "4px 8px", marginTop: 6 }} />
                            <select className="input" name="method" aria-label="Paid by" defaultValue={b.payment_method === "cash" && b.status === "awaiting_payment" ? "zelle" : b.payment_method} style={{ minHeight: 34, padding: "4px 8px" }}>
                              <option value="zelle">Zelle</option><option value="venmo">Venmo</option><option value="cash">Cash</option><option value="card">Card</option><option value="ach">Bank transfer</option>
                            </select>
                            <SubmitButton className="btn btn-primary btn-sm">Record payment</SubmitButton>
                          </ActionForm>
                        </details>
                      )}
                    </>
                  ) : <span className="muted" style={{ fontSize: 13 }}>Not collected online</span>}
                </td>
                {site && <td data-label="Details"><Badge tone="ok" icon="check">Complete</Badge></td>}
                {showActions && (
                  <td data-label="" style={{ minWidth: 200 }}>
                    {b.status === "pending" && (
                      <ActionForm action={decideBookingAction} className="stack">
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="back" value={back} />
                        <input className="input" name="note" placeholder="Optional note to the guest" style={{ minHeight: 36, padding: "6px 10px" }} />
                        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                          <SubmitButton className="btn btn-primary btn-sm" name="decision" value="accept">Accept</SubmitButton>
                          <SubmitButton className="btn btn-danger btn-sm" name="decision" value="decline">Decline</SubmitButton>
                        </div>
                      </ActionForm>
                    )}
                    {b.status === "confirmed" && b.check_in >= today && (
                      <details>
                        <summary className="btn btn-ghost btn-sm" style={{ listStyle: "none" }}>Cancel…</summary>
                        <ActionForm action={decideBookingAction} className="stack" confirmText="Cancel this confirmed booking? The guest will be emailed.">
                          <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="back" value={back} />
                          <input type="hidden" name="decision" value="cancel" />
                          <input className="input" name="note" placeholder="Reason (sent to the guest)" style={{ minHeight: 36, padding: "6px 10px", marginTop: 6 }} />
                          <SubmitButton className="btn btn-danger btn-sm">Cancel booking</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

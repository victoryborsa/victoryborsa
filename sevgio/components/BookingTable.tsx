import { mailUrl, telUrl } from "@/lib/links.ts";
import { extrasOf } from "@/lib/party.ts";
import Link from "next/link";
import { fmtShort } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";
import { StatusPill } from "./ui.tsx";
import { ActionForm, SubmitButton } from "./forms.tsx";
import { decideBookingAction, markPaidAction } from "@/app/actions/host.ts";

const METHOD_SHORT: Record<string, string> = { card: "Card", ach: "Bank transfer", zelle: "Zelle", venmo: "Venmo", cash: "Cash + deposit" };
const PAY_LABEL: Record<string, string> = { none: "-", pending: "Waiting", processing: "Processing", paid: "Paid", deposit_paid: "Deposit paid", failed: "Failed" };
const PAY_TONE: Record<string, string> = { none: "neutral", pending: "warn", processing: "warn", paid: "ok", deposit_paid: "ok", failed: "danger" };
import type { Booking } from "@/lib/bookings.ts";

export type BookingRow = Booking & { title: string; guest_email: string };

/** Bookings table for hosts and admins. Guest contact details appear only for active bookings. */
export function BookingTable({ rows, today, back, showActions = true, fresh, detailBase = "/trips/" }: { rows: BookingRow[]; today: string; back: string; showActions?: boolean; fresh?: Set<string>; detailBase?: string }) {
  if (!rows.length) return <div className="empty"><p className="muted">Nothing here yet.</p></div>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>Reference</th><th>Listing</th><th>Guest</th><th>Dates</th><th className="num">Guests</th><th className="num">Total</th><th>Payment</th><th>Status</th>{showActions && <th>Actions</th>}</tr></thead>
        <tbody>
          {rows.map(b => {
            const active = ["pending", "awaiting_payment", "confirmed"].includes(b.status) && b.check_out >= today;
            return (
              <tr key={b.id} className={fresh?.has(b.id) ? "row-new" : undefined}>
                <td className="mono"><Link href={`${detailBase}${b.code}`}>{b.code}</Link>{fresh?.has(b.id) && <span className="badge-new">New</span>}</td>
                <td>{b.title}</td>
                <td>{b.guest_name}{active && <div className="muted" style={{ fontSize: 13 }}><a href={telUrl(b.guest_phone)}>{b.guest_phone}</a> · <a href={mailUrl(b.guest_email)}>{b.guest_email}</a></div>}{b.message && <div className="hint" style={{ maxWidth: 280 }}>“{b.message}”</div>}</td>
                <td style={{ whiteSpace: "nowrap" }}>{fmtShort(b.check_in)} - {fmtShort(b.check_out)}<div className="hint">{b.nights} night{b.nights === 1 ? "" : "s"}{b.arrival_time ? ` · arrives ${b.arrival_time}` : ""}</div></td>
                <td className="num">{b.guests}</td>
                <td className="num">{money(b.total_cents)}{extrasOf(b).length > 0 && <div className="hint" style={{ textAlign: "left" }}>Extras: {extrasOf(b).map(x => x.name).join(", ")}{extrasOf(b).filter(x => x.details).map(x => <div key={x.key}>{x.name}: {x.details}</div>)}</div>}{b.security_deposit_cents > 0 && <div className="hint">+ {money(b.security_deposit_cents)} deposit to collect</div>}</td>
                <td style={{ minWidth: 190 }}>
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
                <td><StatusPill status={b.status} /></td>
                {showActions && (
                  <td style={{ minWidth: 240 }}>
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

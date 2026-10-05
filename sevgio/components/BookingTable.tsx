import { mailUrl, telUrl } from "@/lib/links.ts";
import { extrasOf } from "@/lib/party.ts";
import Link from "next/link";
import { fmtShort } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";
import { StatusPill } from "./ui.tsx";
import { ActionForm, SubmitButton } from "./forms.tsx";
import { decideBookingAction, markPaidAction } from "@/app/actions/host.ts";
import { setKindAction } from "@/app/actions/channel.ts";

const METHOD_SHORT: Record<string, string> = { card: "Card", ach: "Bank transfer", zelle: "Zelle", venmo: "Venmo", cash: "Cash + deposit" };
const PAY_LABEL: Record<string, string> = { none: "-", pending: "Waiting", processing: "Processing", paid: "Paid", deposit_paid: "Deposit paid", failed: "Failed" };
const PAY_TONE: Record<string, string> = { none: "neutral", pending: "warn", processing: "warn", paid: "ok", deposit_paid: "ok", failed: "danger" };
import type { Booking } from "@/lib/bookings.ts";
import { channelLabel } from "@/lib/channels.ts";
import { nightsBetween } from "@/lib/dates.ts";
import { GuestNameCell } from "./GuestNameForm.tsx";

export type BookingRow = Booking & { title: string; guest_email: string; updated_at: string };

/** A reservation made on Airbnb, Booking.com, Vrbo or another site, shown in the same list as Sevgio bookings. */
export type PlatformRow = { id: string; channel: string; external_ref: string; guest_name: string; guest_name_source: string; place: string; check_in: string; check_out: string;
  guests: number | null; status: string; eff_kind: string; expected_payout_cents: number | null; received_payout_cents: number | null; updated_at: string };

/** "Staying now", "Checked out" and the like for a reservation from another site. */
function platformStatus(r: PlatformRow, today: string): { label: string; tone: string } {
  if (r.status === "cancelled") return { label: "Cancelled", tone: "danger" };
  if (r.eff_kind === "unknown") return { label: "Needs check", tone: "warn" };
  if (r.check_out < today) return { label: "Completed", tone: "neutral" };
  if (r.check_in <= today) return { label: "Staying now", tone: "ok" };
  return { label: "Confirmed", tone: "ok" };
}

/**
 * Bookings table for hosts and admins. Guest contact details appear only for active bookings.
 * With `platform`, reservations from other sites are listed alongside, in the same order (`order`), with a "Booked on" column.
 */
export function BookingTable({ rows, today, back, showActions = true, fresh, detailBase = "/trips/", platform, order = "in-asc" }: { rows: BookingRow[]; today: string; back: string; showActions?: boolean; fresh?: Set<string>; detailBase?: string;
  platform?: PlatformRow[]; order?: "in-asc" | "in-desc" | "updated-desc" }) {
  if (!rows.length && !platform?.length) return <div className="empty"><p className="muted">Nothing here yet.</p></div>;
  const site = !!platform;
  const key = (x: { check_in: string; updated_at: string }) => (order === "updated-desc" ? String(x.updated_at) : x.check_in);
  const items = [...rows.map(b => ({ b, r: null as PlatformRow | null, k: key(b) })), ...(platform || []).map(r => ({ b: null as BookingRow | null, r, k: key(r) }))]
    .sort((x, y) => (order === "in-asc" ? (x.k < y.k ? -1 : x.k > y.k ? 1 : 0) : (x.k > y.k ? -1 : x.k < y.k ? 1 : 0)));
  return (
    <div className="tbl-wrap">
      <table className={site ? "tbl bk-tbl" : "tbl"}>
        <thead><tr><th>{site ? "Reference · booked on" : "Reference"}</th><th>Listing</th><th>Guest</th><th>Dates</th><th>Status</th><th className="num">Guests</th><th className="num">Total</th><th>Payment</th>{showActions && <th>Actions</th>}</tr></thead>
        <tbody>
          {items.map(({ b, r }) => {
            if (r) {
              const st = platformStatus(r, today), label = channelLabel(r.channel), n = nightsBetween(r.check_in, r.check_out);
              return (
                <tr key={"c" + r.id} data-platform={r.channel}>
                  <td data-label="Reference"><Link className="mono" href={`/host/bookings/other-sites/${r.id}`}>{r.external_ref || "No code"}</Link><div className="bk-site"><span className={`pill neutral ch-dot ch-${r.channel}`}>{label}</span></div></td>
                  <td data-label="Listing">{r.place}</td>
                  <td data-label="Guest" style={{ minWidth: 180 }}><GuestNameCell id={r.id} name={r.guest_name} source={r.guest_name_source} site={label} /></td>
                  <td data-label="Dates" style={{ whiteSpace: "nowrap" }}>{fmtShort(r.check_in)} - {fmtShort(r.check_out)}<div className="hint">{n} night{n === 1 ? "" : "s"}</div></td>
                  <td data-label="Status">
                    <span className={`pill ${st.tone}`}>{st.label}</span>
                    {r.eff_kind === "unknown" && r.status === "confirmed" && (
                      <div className="bk-check">
                        <div className="hint">{label} didn&apos;t say if this is a guest or closed dates.</div>
                        {([["reservation", "It's a reservation"], ["blocked", "It's blocked dates"]] as const).map(([k, text]) => (
                          <form key={k} action={setKindAction}>
                            <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="kind" value={k} />
                            <button className="btn btn-ghost btn-sm">{text}</button>
                          </form>
                        ))}
                      </div>
                    )}
                  </td>
                  <td data-label="Guests" className="num">{r.guests ?? <span className="muted">–</span>}</td>
                  <td data-label="Total" className="num">{r.expected_payout_cents == null ? <span className="muted">–</span> : money(r.expected_payout_cents)}{r.expected_payout_cents != null && <div className="hint">Payout</div>}</td>
                  <td data-label="Payment"><span className={`pill ${r.received_payout_cents != null ? "ok" : "neutral"}`}>{r.received_payout_cents != null ? "Payout received" : `Paid on ${label}`}</span></td>
                  {showActions && <td data-label=""><Link className="btn btn-ghost btn-sm" href={`/host/bookings/other-sites/${r.id}`}>Open</Link></td>}
                </tr>
              );
            }
            b = b!;
            const active = ["pending", "awaiting_payment", "confirmed"].includes(b.status) && b.check_out >= today;
            return (
              <tr key={b.id} className={fresh?.has(b.id) ? "row-new" : undefined}>
                <td data-label="Reference"><Link className="mono" href={`${detailBase}${b.code}`}>{b.code}</Link>{fresh?.has(b.id) && <span className="badge-new">New</span>}{site && <div className="bk-site"><span className="pill neutral ch-dot ch-sevgio">Sevgio.com</span></div>}</td>
                <td data-label="Listing">{b.title}</td>
                <td data-label="Guest">{b.guest_name}{active && <div className="muted" style={{ fontSize: 13 }}><a href={telUrl(b.guest_phone)}>{b.guest_phone}</a> · <a href={mailUrl(b.guest_email)}>{b.guest_email}</a></div>}{b.message && <div className="hint" style={{ maxWidth: 280 }}>“{b.message}”</div>}</td>
                <td data-label="Dates" style={{ whiteSpace: "nowrap" }}>{fmtShort(b.check_in)} - {fmtShort(b.check_out)}<div className="hint">{b.nights} night{b.nights === 1 ? "" : "s"}{b.arrival_time ? ` · arrives ${b.arrival_time}` : ""}</div></td>
                <td data-label="Status"><StatusPill status={b.status} /></td>
                <td data-label="Guests" className="num">{b.guests}</td>
                <td data-label="Total" className="num">{money(b.total_cents)}{extrasOf(b).length > 0 && <div className="hint" style={{ textAlign: "left" }}>Extras: {extrasOf(b).map(x => x.name).join(", ")}{extrasOf(b).filter(x => x.details).map(x => <div key={x.key}>{x.name}: {x.details}</div>)}</div>}{b.security_deposit_cents > 0 && <div className="hint">+ {money(b.security_deposit_cents)} deposit to collect</div>}</td>
                <td data-label="Payment" style={{ minWidth: 190 }}>
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
                {showActions && (
                  <td data-label="" style={{ minWidth: 240 }}>
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

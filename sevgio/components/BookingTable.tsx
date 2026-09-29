import Link from "next/link";
import { fmtShort } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";
import { StatusPill } from "./ui.tsx";
import { ActionForm, SubmitButton } from "./forms.tsx";
import { decideBookingAction } from "@/app/actions/host.ts";
import type { Booking } from "@/lib/bookings.ts";

export type BookingRow = Booking & { title: string; guest_email: string };

/** Bookings table for hosts and admins. Guest contact details appear only for active bookings. */
export function BookingTable({ rows, today, back, showActions = true }: { rows: BookingRow[]; today: string; back: string; showActions?: boolean }) {
  if (!rows.length) return <div className="empty"><p className="muted">Nothing here yet.</p></div>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>Reference</th><th>Listing</th><th>Guest</th><th>Dates</th><th className="num">Guests</th><th className="num">Total</th><th>Status</th>{showActions && <th>Actions</th>}</tr></thead>
        <tbody>
          {rows.map(b => {
            const active = ["pending", "confirmed"].includes(b.status) && b.check_out >= today;
            return (
              <tr key={b.id}>
                <td className="mono"><Link href={`/trips/${b.code}`}>{b.code}</Link></td>
                <td>{b.title}</td>
                <td>{b.guest_name}{active && <div className="muted" style={{ fontSize: 13 }}>{b.guest_phone} · {b.guest_email}</div>}{b.message && <div className="hint" style={{ maxWidth: 280 }}>“{b.message}”</div>}</td>
                <td style={{ whiteSpace: "nowrap" }}>{fmtShort(b.check_in)} – {fmtShort(b.check_out)}<div className="hint">{b.nights} nights{b.arrival_time ? ` · arrives ${b.arrival_time}` : ""}</div></td>
                <td className="num">{b.guests}</td>
                <td className="num">{money(b.total_cents)}</td>
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

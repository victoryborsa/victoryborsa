import Link from "next/link";
import { fmtShort } from "@/lib/dates.ts";
import { nightsBetween } from "@/lib/dates.ts";
import { PHASE_LABEL, PHASE_TONE, type SearchRow } from "@/lib/booking-ref.ts";

/**
 * Reservation search results: one row per stay with the details that tell guests with the same name apart.
 * The whole row opens the full reservation. A table on computers, cards on phones.
 */
export function ReservationResults({ rows, back }: { rows: SearchRow[]; back: string }) {
  return (
    <ul className="rs-list" aria-label="Reservations found">
      <li className="rs-head" aria-hidden><span>Reference</span><span>Guest</span><span>Property</span><span>Stay</span><span>Status</span><span>Payment</span></li>
      {rows.map(r => {
        const n = nightsBetween(r.check_in, r.check_out);
        const href = r.source === "sevgio" ? `${r.href}?back=${encodeURIComponent(back)}` : r.href;
        return (
          <li key={r.source + r.id}>
            <Link className="rs-row" href={href} data-ref={r.ref || undefined}>
              <span className="rs-ref">
                <b className="mono">{r.ref || "No code"}</b>
                {r.source === "channel" && <span className="rs-site">{r.site}</span>}
              </span>
              <span className="rs-guest"><b>{r.guest_name || "Guest name not given"}</b>{r.guest_email && <span className="hint">{r.guest_email}</span>}</span>
              <span className="rs-prop">{r.title}</span>
              <span className="rs-dates">{fmtShort(r.check_in)} - {fmtShort(r.check_out)}, {r.check_out.slice(0, 4)}<span className="hint">{n} night{n === 1 ? "" : "s"}{r.guests ? ` · ${r.guests} guest${r.guests === 1 ? "" : "s"}` : ""}</span></span>
              <span className="rs-status">
                <span className={`pill ${PHASE_TONE[r.phase]}`}>{PHASE_LABEL[r.phase]}</span>
                {r.phase !== "cancelled" || r.status_label !== "Cancelled" ? <span className={`pill ${r.status_tone}`}>{r.status_label}</span> : null}
              </span>
              <span className="rs-pay"><span className={`pill ${r.pay_tone}`}>{r.pay_label}</span></span>
              <span className="rs-go" aria-hidden>›</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const PHASES = [["all", "All"], ["upcoming", "Upcoming"], ["current", "Staying now"], ["past", "Past"], ["cancelled", "Cancelled"]] as const;

/** The big search box at the top of Bookings, with quick filters for when the stay is. */
export function ReservationSearchForm({ term, phase }: { term: string; phase: string }) {
  const link = (p: string) => {
    const qs = new URLSearchParams();
    if (term) qs.set("q", term);
    if (p !== "all") qs.set("when", p);
    const s = qs.toString();
    return "/admin/bookings" + (s ? "?" + s : "");
  };
  return (
    <section className="rs-search box" aria-labelledby="rs-h">
      <h2 id="rs-h" className="rs-h">Find a reservation</h2>
      <form method="get" action="/admin/bookings" role="search" className="rs-form">
        <label className="sr-only" htmlFor="rs-q">Booking reference or guest name</label>
        <input id="rs-q" className="input rs-input" type="search" name="q" defaultValue={term} placeholder="Booking reference or guest name" autoComplete="off" spellCheck={false} enterKeyHint="search" maxLength={80} />
        {phase !== "all" && <input type="hidden" name="when" value={phase} />}
        <button className="btn btn-primary">Search</button>
      </form>
      <p className="hint">Type a reference like SV-7KQ2MD, or any part of the guest's name. Capital letters don't matter.</p>
      <nav className="rs-chips" aria-label="When">
        {PHASES.map(([k, label]) => <Link key={k} href={link(k)} className="rs-chip" aria-current={phase === k ? "true" : undefined}>{label}</Link>)}
      </nav>
    </section>
  );
}

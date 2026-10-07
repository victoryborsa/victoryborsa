import Link from "next/link";
import type { User } from "@/lib/auth.ts";
import { dataGaps, financeListings, monthRange, monthsBetween, occupancyFor, readFilters, reportRows, scopeListings, totals, type Filters, type Listing, type ReportRow, type Total } from "@/lib/finance.ts";
import { CHANNELS, unitsOf } from "@/lib/channels.ts";
import { money } from "@/lib/money.ts";
import { addDays, fmtDate, fmtShort, todayLocal } from "@/lib/dates.ts";
import { DateRangePicker } from "./DatePicker.tsx";
import { AutoSubmit } from "./AutoSubmit.tsx";

const monthName = (m: string) => fmtDate(m + "-15", { month: "long", year: "numeric" });

/** A money cell: the amount, or "Needs entry" when the booking site never sent it. */
function Amt({ v, none = "Needs entry" }: { v: number | null; none?: string }) {
  return v == null ? <span className="needs">{none}</span> : <>{money(v)}</>;
}
/** A money total: known amounts added up, with how many reservations are still missing that amount. */
function Tot({ t, none = "Needs entry" }: { t: Total; none?: string }) {
  if (t.missing && !t.known) return <span className="needs">{none}</span>;
  return <>{money(t.cents)}{t.missing > 0 && <small className="needs-n">+{t.missing} {none === "Needs entry" ? "need entry" : "not recorded"}</small>}</>;
}

export type FinanceSearch = { from?: string; to?: string; month?: string; property?: string; room?: string; channel?: string };

const query = (f: Filters, over: Partial<Filters> = {}) => {
  const x = { ...f, ...over };
  return new URLSearchParams({ from: x.from, to: x.to, ...(x.property ? { property: x.property } : {}), ...(x.room ? { room: x.room } : {}), ...(x.channel ? { channel: x.channel } : {}) }).toString();
};

/** Finance: bookings, occupancy and money for any period, home, room and booking site, with the matching statement. */
export async function FinanceView({ u, basePath, sp }: { u: User; basePath: string; sp: FinanceSearch }) {
  const listings = await financeListings(u);
  const f = readFilters(sp, listings);
  const scope = scopeListings(listings, f);
  const homes = listings.filter(l => !l.parent_id).sort((a, b) => a.title.localeCompare(b.title));
  const rooms = f.property ? listings.filter(l => l.parent_id === f.property) : [];
  // The breakdown is by home; with one home chosen, it's by room (or the home itself when it has none).
  // Bookings of the whole home get their own row (money only: their nights already fill each room's occupancy).
  const groups: { id: string; title: string; members: Listing[]; wholeHome?: boolean }[] = f.property
    ? [...(f.room ? scope : unitsOf(scope)).map(l => ({ id: l.id, title: l.parent_id ? l.title : `${l.title} (whole home)`, members: [l] })),
       ...(!f.room && rooms.length ? scope.filter(l => l.id === f.property).map(l => ({ id: l.id, title: "Whole-home bookings", members: [l], wholeHome: true })) : [])]
    : homes.map(h => ({ id: h.id, title: h.title, members: listings.filter(l => l.id === h.id || l.parent_id === h.id) }));

  const today = todayLocal();
  const [ty, tm] = f.to.split("-").map(Number);
  const ovFrom = `${tm === 12 ? ty : ty - 1}-${String((tm % 12) + 1).padStart(2, "0")}-01`;
  const [rows, occ, gaps, byGroup, ovRows] = await Promise.all([
    reportRows(listings, f),
    occupancyFor(listings, f),
    dataGaps(listings, f),
    Promise.all(groups.map(g => g.wholeHome ? null : occupancyFor(listings, f, g.members))),
    reportRows(listings, { ...f, from: ovFrom, to: addDays(monthRange(f.to.slice(0, 7)).next, -1) }),
  ]);
  const t = totals(rows);
  const csv = `/api/finance/statement?${query(f)}`;
  const thisMonth = monthRange(today.slice(0, 7)), lastMonth = monthRange(addDays(thisMonth.start, -1).slice(0, 7));
  const quick: [string, string, string][] = [
    ["This month", thisMonth.start, addDays(thisMonth.next, -1)],
    ["Last month", lastMonth.start, addDays(lastMonth.next, -1)],
    ["Year to date", today.slice(0, 4) + "-01-01", today],
    ["Last 12 months", addDays(today, -364), today],
    ["Next 90 days", today, addDays(today, 89)],
  ];
  // Whole calendar month shown: offer previous / next month arrows.
  const isMonth = f.from.endsWith("-01") && addDays(f.to, 1) === monthRange(f.from.slice(0, 7)).next;
  const stepMonth = (n: number) => { const m = monthRange((n < 0 ? addDays(f.from, -1) : addDays(f.to, 1)).slice(0, 7)); return query(f, { from: m.start, to: addDays(m.next, -1) }); };
  const period = isMonth ? monthName(f.from.slice(0, 7)) : `${fmtDate(f.from, { month: "short", day: "numeric", year: "numeric" })} – ${fmtDate(f.to, { month: "short", day: "numeric", year: "numeric" })}`;
  const byChannel = CHANNELS.map(([k, label]) => ({ k, label, rows: rows.filter(r => r.channel === k) })).filter(c => c.rows.length);

  return (
    <div className="stack fin" style={{ gap: 24 }}>
      <form className="fin-filters" method="get" action={basePath} aria-label="Report filters">
        <AutoSubmit />
        <DateRangePicker key={f.from + f.to} id="fin-dates" today={today} minNights={0} maxMonths={24} names={["from", "to"]} labels={["From", "To"]} initial={{ ci: f.from, co: f.to }} />
        <label className="field"><span>Property</span>
          <select className="input" name="property" defaultValue={f.property || ""}>
            <option value="">All properties</option>
            {homes.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        {rooms.length > 0 && (
          <label className="field"><span>Room</span>
            <select className="input" name="room" defaultValue={f.room || ""}>
              <option value="">Whole home and all rooms</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </label>
        )}
        <label className="field"><span>Booked on</span>
          <select className="input" name="channel" defaultValue={f.channel || ""}>
            <option value="">All sites</option>
            {CHANNELS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <div className="fin-actions">
          <button className="btn btn-ghost">Show</button>
          <a className="btn btn-primary" href={csv}>Download statement (CSV)</a>
        </div>
      </form>
      <nav className="fin-quick" aria-label="Quick periods">
        {quick.map(([label, a, z]) => <Link key={label} className="btn btn-ghost btn-sm" aria-current={a === f.from && z === f.to ? "true" : undefined} href={`${basePath}?${query(f, { from: a, to: z })}`}>{label}</Link>)}
        <span className="spacer" />
        <Link className="btn btn-ghost btn-sm" href="/host/bookings/other-sites">Reservations from other sites</Link>
        <Link className="btn btn-ghost btn-sm" href="/host/finance/import">Import payout file</Link>
      </nav>

      {(gaps.needsEntry > 0 || gaps.unclear > 0 || gaps.feedErrors.length > 0) && (
        <div className="notice warn" role="status">
          <div className="stack" style={{ gap: 6 }}>
            <b>Some numbers are incomplete</b>
            {gaps.needsEntry > 0 && <span>{gaps.needsEntry} reservation{gaps.needsEntry === 1 ? "" : "s"} from other sites {gaps.needsEntry === 1 ? "has" : "have"} no prices or payout yet. Calendar links only share dates. <Link href="/host/finance/import">Import a payout file</Link> or <Link href="/host/bookings/other-sites?needs=1">enter them by hand</Link>.</span>}
            {gaps.unclear > 0 && <span>{gaps.unclear} external calendar block{gaps.unclear === 1 ? " isn't" : "s aren't"} counted as bookings until a reservations file or details you add confirm {gaps.unclear === 1 ? "it" : "them"}. <Link href="/host/bookings/other-sites?kind=unknown">See them</Link>.</span>}
            {gaps.feedErrors.map(e => <span key={e.name + e.place}>{e.name} calendar for {e.place}: {e.error}</span>)}
          </div>
        </div>
      )}

      <div>
        <div className="fin-period">
          {isMonth && <Link className="cal-arrow" href={`${basePath}?${stepMonth(-1)}`} aria-label="Previous month">‹</Link>}
          <h2>{period}</h2>
          {isMonth && <Link className="cal-arrow" href={`${basePath}?${stepMonth(1)}`} aria-label="Next month">›</Link>}
        </div>
        <div className="stats fin-stats">
          <div className="stat"><b>{t.bookings}</b><span>Reservations checking in{t.cancelled ? ` · ${t.cancelled} cancelled with charges` : ""}</span></div>
          <div className="stat"><b>{occ.bookedNights}</b><span>Nights booked</span></div>
          <div className="stat"><b>{occ.percent == null ? "–" : `${occ.percent}%`}</b><span>Occupancy{scope.some(l => l.parent_id) ? " (room by room)" : ""}</span></div>
          <div className="stat"><b>{occ.blocked}</b><span>Nights blocked{occ.unknown ? ` · ${occ.unknown} unclear` : ""}</span></div>
          <div className="stat money"><b><Tot t={t.rent} /></b><span>Rental income</span></div>
          <div className="stat money"><b><Tot t={t.cleaning} /></b><span>Cleaning fees</span></div>
          <div className="stat money"><b><Tot t={t.other} /></b><span>Other charges (pets, extras)</span></div>
          <div className="stat money"><b><Tot t={t.commission} /></b><span>Platform commissions</span></div>
          <div className="stat money"><b><Tot t={t.refund} /></b><span>Refunds</span></div>
          <div className="stat money"><b><Tot t={t.expected} /></b><span>Expected payout</span></div>
          <div className="stat money"><b><Tot t={t.received} none="Not recorded" /></b><span>Received payout</span></div>
          <div className="stat money"><b><Tot t={t.fee} /></b><span>Management fees</span></div>
          <div className="stat money"><b><Tot t={t.owner} /></b><span>Owner payout</span></div>
          <div className="stat money"><b><Tot t={t.tax} /></b><span>Lodging tax collected</span></div>
        </div>
        <p className="hint">
          Reservations and money count in the period they check in. Nights and occupancy count only nights inside the period, and blocked nights are left out of what was available.
          A whole-home booking fills every room in it, so homes with rooms are measured room by room and nothing is counted twice.
          Expected payout is what should reach you: for Sevgio bookings it&apos;s the guest&apos;s total (including tax you remit); for other sites it&apos;s their payout after commission.
          Owner payout = rent + cleaning + other charges − commission − refunds − management fee.
        </p>
      </div>

      <div>
        <h3 className="fin-h">{f.property ? "By room" : "By property"}</h3>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>{f.property ? "Room" : "Property"}</th><th className="num">Reservations</th><th className="num">Nights booked</th><th className="num">Blocked</th><th className="num">Occupancy</th><th className="num">Rental income</th><th className="num">Cleaning</th><th className="num">Commission</th><th className="num">Expected payout</th><th className="num">Owner payout</th></tr></thead>
            <tbody>
              {groups.map((g, i) => {
                const ids = new Set(g.members.map(m => m.id));
                const mine = totals(rows.filter(r => ids.has(r.property_id)));
                const o = byGroup[i] ?? { bookedNights: 0, blocked: 0, percent: null };
                return (
                  <tr key={g.id}>
                    <td>{f.property ? g.title : <Link href={`${basePath}?${query(f, { property: g.id, room: null })}`}>{g.title}</Link>}</td>
                    <td className="num">{mine.bookings}</td><td className="num">{g.wholeHome ? rows.filter(r => ids.has(r.property_id) && r.status === "confirmed").reduce((n, r) => n + r.nights, 0) : o.bookedNights}</td>
                    <td className="num">{g.wholeHome ? "–" : o.blocked}</td>
                    <td className="num">{g.wholeHome || o.percent == null ? "–" : `${o.percent}%`}</td>
                    <td className="num"><Tot t={mine.rent} /></td><td className="num"><Tot t={mine.cleaning} /></td><td className="num"><Tot t={mine.commission} /></td>
                    <td className="num"><Tot t={mine.expected} /></td><td className="num"><b><Tot t={mine.owner} /></b></td>
                  </tr>
                );
              })}
              <tr className="fin-total">
                <td><b>Total</b></td><td className="num"><b>{t.bookings}</b></td><td className="num"><b>{occ.bookedNights}</b></td><td className="num"><b>{occ.blocked}</b></td>
                <td className="num"><b>{occ.percent == null ? "–" : `${occ.percent}%`}</b></td>
                <td className="num"><b><Tot t={t.rent} /></b></td><td className="num"><b><Tot t={t.cleaning} /></b></td><td className="num"><b><Tot t={t.commission} /></b></td>
                <td className="num"><b><Tot t={t.expected} /></b></td><td className="num"><b><Tot t={t.owner} /></b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {byChannel.length > 0 && (
        <div>
          <h3 className="fin-h">By booking site</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Site</th><th className="num">Reservations</th><th className="num">Nights</th><th className="num">Rental income</th><th className="num">Commission</th><th className="num">Refunds</th><th className="num">Expected payout</th><th className="num">Received</th></tr></thead>
              <tbody>
                {byChannel.map(c => {
                  const x = totals(c.rows);
                  return (
                    <tr key={c.k}>
                      <td><Link href={`${basePath}?${query(f, { channel: c.k as Filters["channel"] })}`}>{c.label}</Link></td>
                      <td className="num">{x.bookings}</td><td className="num">{c.rows.reduce((n, r) => n + r.nights, 0)}</td>
                      <td className="num"><Tot t={x.rent} /></td><td className="num"><Tot t={x.commission} /></td><td className="num"><Tot t={x.refund} /></td>
                      <td className="num"><Tot t={x.expected} /></td><td className="num"><Tot t={x.received} none="Not recorded" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h3 className="fin-h">Reservations statement</h3>
        {rows.length === 0 ? <div className="empty"><p className="muted">No reservations check in during {period}.</p></div> : <Statement rows={rows} />}
      </div>

      <div>
        <h3 className="fin-h">Month by month: the 12 months to {monthName(f.to.slice(0, 7))}</h3>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Month</th><th className="num">Reservations</th><th className="num">Nights</th><th className="num">Rental income</th><th className="num">Commission</th><th className="num">Expected payout</th><th className="num">Received</th><th className="num">Owner payout</th></tr></thead>
            <tbody>
              {monthsBetween(ovFrom, f.to).map(m => {
                const mr = ovRows.filter(r => r.check_in.startsWith(m)), x = totals(mr), mm = monthRange(m);
                return (
                  <tr key={m}>
                    <td><Link href={`${basePath}?${query(f, { from: mm.start, to: addDays(mm.next, -1) })}`}>{monthName(m)}</Link></td>
                    <td className="num">{x.bookings}</td><td className="num">{mr.reduce((n, r) => n + r.nights, 0)}</td>
                    <td className="num"><Tot t={x.rent} /></td><td className="num"><Tot t={x.commission} /></td><td className="num"><Tot t={x.expected} /></td>
                    <td className="num"><Tot t={x.received} none="Not recorded" /></td><td className="num"><Tot t={x.owner} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Statement({ rows }: { rows: ReportRow[] }) {
  const t = totals(rows);
  return (
    <div className="tbl-wrap">
      <table className="tbl fin-stmt">
        <thead><tr><th>Booked on</th><th>Reference</th><th>Listing</th><th>Guest</th><th>Dates</th><th className="num">Nights</th><th className="num">Rent</th><th className="num">Cleaning</th><th className="num">Other</th><th className="num">Tax</th><th className="num">Commission</th><th className="num">Refunds</th><th className="num">Expected payout</th><th className="num">Received</th><th className="num">Mgmt fee</th><th className="num">Owner payout</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} data-res={r.ref || r.id}>
              <td><span className={`pill neutral ch-dot ch-${r.channel}`}>{r.channelLabel}</span>{r.status === "cancelled" && <div className="hint">Cancelled</div>}</td>
              <td className="mono"><Link href={r.href}>{r.ref || (r.needsEntry ? "Add details" : "Open")}</Link></td>
              <td>{r.place}</td><td>{r.guest_name || <span className="muted">Not provided by the site</span>}</td>
              <td style={{ whiteSpace: "nowrap" }}>{fmtShort(r.check_in)} – {fmtShort(r.check_out)}</td>
              <td className="num">{r.nights}</td>
              <td className="num"><Amt v={r.rent} /></td><td className="num"><Amt v={r.cleaning} /></td><td className="num"><Amt v={r.other} /></td>
              <td className="num"><Amt v={r.tax} /></td><td className="num"><Amt v={r.commission} /></td><td className="num"><Amt v={r.refund} /></td>
              <td className="num"><Amt v={r.expected} /></td>
              <td className="num"><Amt v={r.received} none="Not recorded" />{r.payout_date && <div className="hint">{fmtShort(r.payout_date)}</div>}</td>
              <td className="num"><Amt v={r.fee} /><div className="hint">{r.mgmtPercent}%</div></td>
              <td className="num"><b><Amt v={r.owner} /></b></td>
            </tr>
          ))}
          <tr className="fin-total">
            <td colSpan={5}><b>Total · {t.bookings} reservation{t.bookings === 1 ? "" : "s"}</b></td>
            <td className="num"><b>{rows.reduce((n, r) => n + r.nights, 0)}</b></td>
            <td className="num"><b><Tot t={t.rent} /></b></td><td className="num"><b><Tot t={t.cleaning} /></b></td><td className="num"><b><Tot t={t.other} /></b></td>
            <td className="num"><b><Tot t={t.tax} /></b></td><td className="num"><b><Tot t={t.commission} /></b></td><td className="num"><b><Tot t={t.refund} /></b></td>
            <td className="num"><b><Tot t={t.expected} /></b></td><td className="num"><b><Tot t={t.received} none="Not recorded" /></b></td>
            <td className="num"><b><Tot t={t.fee} /></b></td><td className="num"><b><Tot t={t.owner} /></b></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

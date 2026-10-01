import Link from "next/link";
import type { User } from "@/lib/auth.ts";
import { financeProperties, propertySummaries, statement, validMonth, yearOverview } from "@/lib/finance.ts";
import { money } from "@/lib/money.ts";
import { fmtShort, todayLocal } from "@/lib/dates.ts";

const monthName = (m: string) => new Date(m + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const shift = (m: string, n: number) => { let [y, mo] = m.split("-").map(Number); mo += n; while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; } return `${y}-${String(mo).padStart(2, "0")}`; };

/** Owner statements: month summary, per-property table, reservations statement and a 12-month overview. */
export async function FinanceView({ u, basePath, sp }: { u: User; basePath: string; sp: { month?: string; property?: string } }) {
  const month = validMonth(sp.month) ? sp.month! : todayLocal().slice(0, 7);
  const props = await financeProperties(u);
  const propertyId = props.some(p => p.id === sp.property) ? sp.property! : null;
  const rows = await statement(u, month, propertyId);
  const [summary, overview] = await Promise.all([propertySummaries(u, month, propertyId, rows), yearOverview(u, month, propertyId)]);
  const t = summary.reduce((a, s) => ({ bookings: a.bookings + s.bookings, nights: a.nights + s.nights, rent: a.rent + s.rent, cleaning: a.cleaning + s.cleaning, tax: a.tax + s.tax, fee: a.fee + s.fee, owner: a.owner + s.owner }), { bookings: 0, nights: 0, rent: 0, cleaning: 0, tax: 0, fee: 0, owner: 0 });
  const days = Number(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate());
  const occupancy = summary.length ? Math.round((t.nights / (days * summary.length)) * 100) : 0;
  const link = (m: string) => `${basePath}?month=${m}${propertyId ? `&property=${propertyId}` : ""}`;
  const csv = `/api/finance/statement?month=${month}${propertyId ? `&property=${propertyId}` : ""}`;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <form className="row" method="get" action={basePath}>
        <Link className="btn btn-ghost btn-sm" href={link(shift(month, -1))} aria-label="Previous month">‹</Link>
        <input className="input" type="month" name="month" defaultValue={month} style={{ width: "auto" }} aria-label="Month" />
        <Link className="btn btn-ghost btn-sm" href={link(shift(month, 1))} aria-label="Next month">›</Link>
        <select className="input" name="property" defaultValue={propertyId || ""} style={{ width: "auto", minWidth: 220 }} aria-label="Property">
          <option value="">All properties</option>
          {props.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <button className="btn btn-ghost">Show</button>
        <span className="spacer" />
        <a className="btn btn-primary" href={csv}>Download statement (CSV)</a>
      </form>

      <div>
        <h2 style={{ marginBottom: 12 }}>{monthName(month)}</h2>
        <div className="stats">
          <div className="stat"><b>{t.bookings}</b><span>Bookings (by check-in)</span></div>
          <div className="stat"><b>{t.nights}</b><span>Nights booked · {occupancy}% occupancy</span></div>
          <div className="stat"><b className="mono" style={{ fontFamily: "var(--f-mono)", fontWeight: 500 }}>{money(t.rent)}</b><span>Rent (after discounts)</span></div>
          <div className="stat"><b className="mono" style={{ fontFamily: "var(--f-mono)", fontWeight: 500 }}>{money(t.cleaning)}</b><span>Cleaning & pet fees</span></div>
          <div className="stat"><b className="mono" style={{ fontFamily: "var(--f-mono)", fontWeight: 500 }}>{money(t.fee)}</b><span>Management fees</span></div>
          <div className="stat"><b className="mono" style={{ fontFamily: "var(--f-mono)", fontWeight: 500 }}>{money(t.owner)}</b><span>Owner payout</span></div>
          <div className="stat"><b className="mono" style={{ fontFamily: "var(--f-mono)", fontWeight: 500 }}>{money(t.tax)}</b><span>Lodging tax collected (to remit)</span></div>
        </div>
        <p className="hint">Owner payout = rent after discounts + cleaning and pet fees − management fee. Lodging tax is collected from guests and paid to the tax office separately.</p>
      </div>

      <div>
        <h3 style={{ marginBottom: 12 }}>By property</h3>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Property</th><th className="num">Bookings</th><th className="num">Nights</th><th className="num">Occupancy</th><th className="num">Rent</th><th className="num">Cleaning &amp; pets</th><th className="num">Mgmt fee</th><th className="num">Owner payout</th></tr></thead>
            <tbody>
              {summary.map(s => (
                <tr key={s.id}>
                  <td><Link href={`${basePath}?month=${month}&property=${s.id}`}>{s.title}</Link></td>
                  <td className="num">{s.bookings}</td><td className="num">{s.nights}</td><td className="num">{s.occupancy}%</td>
                  <td className="num">{money(s.rent)}</td><td className="num">{money(s.cleaning)}</td><td className="num">{money(s.fee)}</td><td className="num"><b>{money(s.owner)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: 12 }}>Reservations statement</h3>
        {rows.length === 0 ? <div className="empty"><p className="muted">No confirmed check-ins in {monthName(month)}.</p></div> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Reference</th><th>Listing</th><th>Guest</th><th>Dates</th><th className="num">Nights</th><th className="num">Rent</th><th className="num">Cleaning &amp; pets</th><th className="num">Tax</th><th className="num">Guest paid</th><th className="num">Mgmt fee</th><th className="num">Owner payout</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="mono"><Link href={`/trips/${r.code}`}>{r.code}</Link></td>
                    <td>{r.title}</td><td>{r.guest_name}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtShort(r.check_in)} – {fmtShort(r.check_out)}</td>
                    <td className="num">{r.nights}</td>
                    <td className="num">{money(r.rent)}{r.discount_cents > 0 && <div className="hint">after {money(r.discount_cents)} discount</div>}</td>
                    <td className="num">{money(r.cleaning_fee_cents)}</td><td className="num">{money(r.tax_cents)}</td><td className="num">{money(r.total_cents)}</td>
                    <td className="num">{money(r.fee)}<div className="hint">{Number(r.management_fee_percent)}%</div></td>
                    <td className="num"><b>{money(r.owner)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 style={{ marginBottom: 12 }}>Financial overview: last 12 months</h3>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Month</th><th className="num">Bookings</th><th className="num">Nights</th><th className="num">Rent</th><th className="num">Mgmt fee</th><th className="num">Owner payout</th></tr></thead>
            <tbody>
              {overview.map(o => (
                <tr key={o.month}>
                  <td><Link href={link(o.month)}>{monthName(o.month)}</Link></td>
                  <td className="num">{o.bookings}</td><td className="num">{o.nights}</td><td className="num">{money(o.rent)}</td><td className="num">{money(o.fee)}</td><td className="num">{money(o.owner)}</td>
                </tr>
              ))}
              <tr>
                <td><b>12-month total</b></td>
                <td className="num"><b>{overview.reduce((n, o) => n + o.bookings, 0)}</b></td>
                <td className="num"><b>{overview.reduce((n, o) => n + o.nights, 0)}</b></td>
                <td className="num"><b>{money(overview.reduce((n, o) => n + o.rent, 0))}</b></td>
                <td className="num"><b>{money(overview.reduce((n, o) => n + o.fee, 0))}</b></td>
                <td className="num"><b>{money(overview.reduce((n, o) => n + o.owner, 0))}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { financeListings, placeName } from "@/lib/finance.ts";
import { CHANNELS, channelLabel } from "@/lib/channels.ts";
import { PayoutImport } from "@/components/PayoutImport.tsx";

/** Bring prices, fees and payouts in from a site's payout file, since calendar links carry only dates. */
export default async function ImportPayouts() {
  const u = await requireUser(["host", "admin"], "/host/finance/import");
  const listings = await financeListings(u);
  const options = listings.map(l => ({ id: l.id, name: placeName(listings, l.id) })).sort((a, b) => a.name.localeCompare(b.name));
  const history = await q<{ id: string; file_name: string; channel: string; rows: number; updated: number; created: number; skipped: number; created_at: string }>(
    u.role === "admin" ? "SELECT * FROM channel_imports ORDER BY created_at DESC LIMIT 10" : "SELECT * FROM channel_imports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10", u.role === "admin" ? [] : [u.id]);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <p><Link href="/host/finance">‹ Finance</Link></p>
      <h2>Import reservations or payouts</h2>
      <section className="box imp-names" aria-labelledby="imp-names-h">
        <h3 id="imp-names-h">Get guest names and booking references</h3>
        <p className="hint">Calendar links from Airbnb, Booking.com and Vrbo never include guest names. Each site&apos;s reservations download does. Import it once and every matching reservation gets its guest name and reference; names already typed in are kept.</p>
        <ol className="imp-steps">
          <li><b>Airbnb:</b> on airbnb.com, switch to hosting › <b>Today</b> › <b>Reservations</b> (or Menu › Reservations) › <b>All</b> › <b>Export</b> › <b>Download CSV file</b>.</li>
          <li><b>Booking.com:</b> in the extranet, <b>Reservations</b> › set the dates › <b>Download</b> (choose CSV, or open the Excel file and save it as CSV).</li>
          <li><b>Vrbo:</b> <b>Reservations</b> › <b>Export</b>, or Financial reporting › Payouts › Export.</li>
          <li>Below, choose the file and the site, click <b>Check file</b>, review what will change, then <b>Import</b>. Leave “These payouts have already reached my bank account” unticked for a reservations download.</li>
        </ol>
      </section>
      <div className="stack hint" style={{ gap: 4 }}>
        <span>Payout and earnings reports work too, and also bring in rent, fees, commissions and payouts:</span>
        <span><b>Airbnb:</b> Menu › Earnings › Transaction history (paid or upcoming) › Export CSV.</span>
        <span><b>Vrbo:</b> Financial reporting › Payouts › Export.</span>
        <span><b>Booking.com:</b> Finance › Reservation statement, or Reservations › Download, saved as CSV.</span>
        <span>Each line is matched to its reservation by confirmation code, or by listing and dates. Importing the same file again replaces the amounts instead of adding them twice.</span>
      </div>
      <PayoutImport listings={options} channels={CHANNELS.filter(c => c[0] !== "sevgio").map(c => [c[0], c[1]])} />
      {history.length > 0 && (
        <div>
          <h3>Recent imports</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>When</th><th>File</th><th>Site</th><th className="num">Reservations</th><th className="num">Updated</th><th className="num">Added</th><th className="num">Skipped</th></tr></thead>
              <tbody>{history.map(h => (
                <tr key={h.id}><td>{new Date(h.created_at).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })}</td><td>{h.file_name}</td><td>{channelLabel(h.channel)}</td>
                  <td className="num">{h.rows}</td><td className="num">{h.updated}</td><td className="num">{h.created}</td><td className="num">{h.skipped}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

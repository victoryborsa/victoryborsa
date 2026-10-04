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
      <h2>Import a payout file</h2>
      <div className="stack hint" style={{ gap: 4 }}>
        <span>Calendar links only share dates. To see rent, fees, commissions and payouts, download the payout or earnings report from each site and import it here:</span>
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

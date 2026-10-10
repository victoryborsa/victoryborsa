import Link from "next/link";
import { requireUser } from "@/lib/auth.ts";
import { financeListings, placeName } from "@/lib/finance.ts";
import { ChannelResForm } from "@/components/ChannelResForm.tsx";

/** Add a reservation from a site that has no calendar link (or one the link missed). */
export default async function NewOtherSiteReservation() {
  const u = await requireUser(["host", "admin"], "/host/bookings/other-sites/new");
  const listings = await financeListings(u);
  const options = listings.map(l => ({ id: l.id, name: placeName(listings, l.id) })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 820 }}>
      <p><Link href="/host/bookings/other-sites">‹ Other sites</Link></p>
      <h2>Add a reservation from another site</h2>
      <p className="muted">Use this for sites without a calendar link (for example Roomies or a corporate client). Its dates are blocked on Sevgio and sent to your other sites through Sevgio&apos;s calendar link.</p>
      <div className="box"><ChannelResForm v={{}} listings={options} /></div>
    </div>
  );
}

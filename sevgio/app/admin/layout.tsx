import { requireUser } from "@/lib/auth.ts";
import { SubNav } from "@/components/SubNav.tsx";
import { unseenBookings } from "@/lib/alerts.ts";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser(["admin"], "/admin");
  const fresh = await unseenBookings(u);
  return (
    <div className="wrap" style={{ paddingBottom: 56 }}>
      <div className="dash-head"><div><p className="eyebrow">Admin</p><h1 style={{ fontSize: "clamp(26px,4vw,36px)" }}>Sevgio operations</h1></div></div>
      <SubNav links={[["/admin", "Overview"], ["/admin/calendar", "Calendar"], ["/admin/users", "Users & roles"], ["/admin/listings", "Listings"], ["/admin/bookings", "Bookings", fresh], ["/admin/finance", "Finance"], ["/admin/log", "Errors & activity"], ["/admin/messages", "Messages"], ["/admin/guide", "Guide photos"], ["/admin/settings", "Settings"]]} />
      {children}
    </div>
  );
}

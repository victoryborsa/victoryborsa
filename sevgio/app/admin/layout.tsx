import { requireUser } from "@/lib/auth.ts";
import { SubNav } from "@/components/SubNav.tsx";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireUser(["admin"], "/admin");
  return (
    <div className="wrap" style={{ paddingBottom: 56 }}>
      <div className="dash-head"><div><p className="eyebrow">Admin</p><h1 style={{ fontSize: "clamp(26px,4vw,36px)" }}>Sevgio operations</h1></div></div>
      <SubNav links={[["/admin", "Overview"], ["/admin/users", "Users & roles"], ["/admin/listings", "Listings"], ["/admin/bookings", "Bookings"], ["/admin/finance", "Finance"], ["/admin/log", "Errors & activity"], ["/admin/messages", "Messages"], ["/admin/settings", "Settings"]]} />
      {children}
    </div>
  );
}

import { requireUser } from "@/lib/auth.ts";
import { DashNav } from "@/components/DashNav.tsx";
import { unseenBookings } from "@/lib/alerts.ts";
import { one } from "@/lib/db.ts";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser(["admin"], "/admin");
  const [fresh, errs] = await Promise.all([
    unseenBookings(u),
    one<{ n: number }>("SELECT count(*)::int AS n FROM event_log WHERE level = 'error' AND resolved_at IS NULL"),
  ]);
  return (
    <div className="dash wrap wrap-wide theme-light">
      <DashNav label="Admin menu" groups={[
        { items: [
          { href: "/admin", label: "Dashboard", icon: "dashboard" },
          { href: "/admin/messages", label: "Messages", icon: "inbox" },
          { href: "/admin/calendar", label: "Calendar", icon: "calendar" },
          { href: "/admin/bookings", label: "Bookings", icon: "bookings", badge: fresh },
          { href: "/admin/listings", label: "Listings", icon: "listings" },
          { href: "/admin/finance", label: "Finance", icon: "finance" },
        ] },
        { title: "Website", items: [
          { href: "/admin/users", label: "Users & roles", icon: "users" },
          { href: "/admin/events", label: "Events", icon: "events" },
          { href: "/admin/guide", label: "Pittsburgh guide", icon: "photos" },
        ] },
        { title: "System", items: [
          { href: "/admin/log", label: "Errors & activity", icon: "activity", badge: errs?.n || 0 },
          { href: "/admin/settings", label: "Settings", icon: "settings" },
        ] },
      ]} />
      <div className="dash-main">
        <div className="dash-head"><div><p className="eyebrow">Admin</p><h1 className="dash-h1">Sevgio operations</h1></div></div>
        {children}
      </div>
    </div>
  );
}

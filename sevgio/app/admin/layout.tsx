import { requireUser } from "@/lib/auth.ts";
import { DashNav } from "@/components/DashNav.tsx";
import { AdminFind } from "@/components/AdminFind.tsx";
import { unseenBookings } from "@/lib/alerts.ts";
import { openConflictCounts } from "@/lib/conflicts.ts";
import { ConflictBanner } from "@/components/Conflicts.tsx";
import { one } from "@/lib/db.ts";
import { failingFeedCount } from "@/lib/sync-health.ts";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser(["admin"], "/admin");
  const [fresh, clash, errs, failingFeeds] = await Promise.all([
    unseenBookings(u),
    openConflictCounts(u),
    one<{ n: number }>("SELECT count(*)::int AS n FROM event_log WHERE level = 'error' AND resolved_at IS NULL"),
    failingFeedCount(u),
  ]);
  return (
    <div className="dash wrap wrap-wide theme-light">
      <DashNav label="Admin menu" groups={[
        { items: [
          { href: "/admin", label: "Dashboard", icon: "dashboard" },
          { href: "/admin/messages", label: "Messages", icon: "inbox" },
          { href: "/admin/calendar", label: "Calendar", icon: "calendar" },
          { href: "/admin/bookings", label: "Bookings", icon: "bookings", badge: fresh },
          { href: "/admin/conflicts", label: "Double bookings", icon: "conflict", badge: clash.active + clash.cleared },
          { href: "/admin/calendar-sync", label: "Calendar sync", icon: "sync", badge: failingFeeds },
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
        <div className="dash-head"><div><p className="eyebrow">Admin</p><h1 className="dash-h1">Sevgio operations</h1></div><AdminFind /></div>
        <ConflictBanner base="/admin" active={clash.active} cleared={clash.cleared} />
        {children}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { requireUser } from "@/lib/auth.ts";
import { DashNav } from "@/components/DashNav.tsx";
import { unseenBookings } from "@/lib/alerts.ts";
import { openConflictCounts } from "@/lib/conflicts.ts";
import { ConflictBanner } from "@/components/Conflicts.tsx";
import { failingFeedCount } from "@/lib/sync-health.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser(["host", "admin"], "/host");
  const [fresh, clash, failingFeeds] = await Promise.all([unseenBookings(u), openConflictCounts(u), failingFeedCount(u)]);
  return (
    <div className="dash wrap wrap-wide theme-light">
      <DashNav label="Host menu" groups={[
        { items: [
          { href: "/host", label: "Dashboard", icon: "dashboard" },
          { href: "/host/messages", label: "Messages", icon: "inbox" },
          { href: "/host/calendar", label: "Calendar", icon: "calendar" },
          { href: "/host/bookings", label: "Bookings", icon: "bookings", badge: fresh },
          { href: "/host/conflicts", label: "Double bookings", icon: "conflict", badge: clash.active + clash.cleared },
          { href: "/host/calendar-sync", label: "Calendar sync", icon: "sync", badge: failingFeeds },
          { href: "/host/listings", label: "Listings", icon: "listings" },
          { href: "/host/finance", label: "Finance", icon: "finance" },
        ] },
        ...(u.role === "admin" ? [{ title: "Admin", items: [{ href: "/admin", label: "Admin dashboard", icon: "settings" as const }] }] : []),
      ]} />
      <div className="dash-main">
        <div className="dash-head"><div><p className="eyebrow">{u.role === "admin" ? "Host tools (admin view: all listings)" : "Host dashboard"}</p><h1 className="dash-h1">{u.name}</h1></div></div>
        <ConflictBanner base="/host" active={clash.active} cleared={clash.cleared} />
        {children}
      </div>
    </div>
  );
}

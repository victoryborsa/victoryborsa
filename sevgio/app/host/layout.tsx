import { requireUser } from "@/lib/auth.ts";
import { SubNav } from "@/components/SubNav.tsx";

export const dynamic = "force-dynamic";

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser(["host", "admin"], "/host");
  return (
    <div className="wrap" style={{ paddingBottom: 56 }}>
      <div className="dash-head"><div><p className="eyebrow">{u.role === "admin" ? "Host tools (admin view: all listings)" : "Host dashboard"}</p><h1 style={{ fontSize: "clamp(26px,4vw,36px)" }}>{u.name}</h1></div></div>
      <SubNav links={[["/host", "Overview"], ["/host/listings", "Listings"], ["/host/bookings", "Bookings"], ["/host/messages", "Messages"]]} />
      {children}
    </div>
  );
}

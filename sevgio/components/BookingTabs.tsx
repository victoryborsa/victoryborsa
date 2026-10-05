import Link from "next/link";

const TABS = [["upcoming", "Upcoming", "/host/bookings?view=upcoming"], ["requests", "Requests", "/host/bookings?view=requests"], ["past", "Past", "/host/bookings?view=past"],
  ["cancelled", "Cancelled & declined", "/host/bookings?view=cancelled"], ["other-sites", "Other sites", "/host/bookings/other-sites"]] as const;

/** The tabs above the host's bookings: Sevgio bookings by status, and reservations from other sites. */
export function BookingTabs({ current, q = "" }: { current: string; q?: string }) {
  return (
    <div className="seg" style={{ marginBottom: 16 }} role="tablist">
      {TABS.map(([k, label, href]) => (
        <Link key={k} href={q && k !== "other-sites" ? `${href}&q=${encodeURIComponent(q)}` : href} role="tab" aria-selected={k === current} className="btn btn-sm"
          style={k === current ? { background: "var(--ink)", color: "var(--bg)" } : { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)" }}>{label}</Link>
      ))}
    </div>
  );
}

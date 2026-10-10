"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type NavIcon = "dashboard" | "inbox" | "calendar" | "bookings" | "listings" | "finance" | "users" | "events" | "photos" | "activity" | "settings" | "home" | "conflict" | "sync";
export type NavItem = { href: string; label: string; icon: NavIcon; badge?: number };
export type NavGroup = { title?: string; items: NavItem[] };

// Simple line icons (24×24, drawn with the text color).
const PATHS: Record<NavIcon, string> = {
  dashboard: "M4 14a8 8 0 1 1 16 0M12 14l4-4M3 18h18",
  inbox: "M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  bookings: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3",
  listings: "M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6",
  finance: "M3 6h18v12H3zM3 10h18M7 15h4",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0 0-6M22 20c0-3-2-5-5-5",
  events: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6L12 16.4 6.6 19.4l1.3-6L3.4 9.3l6-.7z",
  photos: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  home: "M3 11l9-7 9 7v9H3z",
  conflict: "M12 3l10 17H2zM12 10v4M12 17.5h.01",
  sync: "M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4",
};
// Full-colour versions in public/icons/color; PATHS above is kept as the plain fallback.
const COLOR: Record<NavIcon, string> = { dashboard: "dashboard", inbox: "inbox", calendar: "calendar", bookings: "bookings", listings: "listings", finance: "finance", users: "users", events: "ticket", photos: "photos", activity: "activity", settings: "settings", home: "home", conflict: "conflict", sync: "sync" };
export function Icon({ name }: { name: NavIcon }) {
  return <img className="dn-ic dn-ic-color" src={`/icons/color/${COLOR[name]}.svg`} width={20} height={20} alt="" aria-hidden="true" />;
}

/** Dashboard menu: a fixed column on the left on computers; on phones and tablets, a button that opens the full list. */
export function DashNav({ groups, label }: { groups: NavGroup[]; label: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const all = groups.flatMap(g => g.items);
  const active = all.map(i => i.href).filter(h => path === h || path.startsWith(h + "/")).sort((a, b) => b.length - a.length)[0];
  const current = all.find(i => i.href === active);
  return (
    <nav className={`dn${open ? " open" : ""}`} aria-label={label}>
      <button type="button" className="dn-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {current && <Icon name={current.icon} />}
        <span>{current?.label || label}</span>
        <svg className="dn-chev" viewBox="0 0 24 24" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div className="dn-list">
        {groups.map((g, gi) => (
          <div key={gi} className="dn-group">
            {g.title && <p className="dn-title">{g.title}</p>}
            {g.items.map(i => (
              <Link key={i.href} href={i.href} aria-current={i.href === active ? "page" : undefined}>
                <Icon name={i.icon} />
                <span className="dn-label">{i.label}</span>
                {i.badge ? <span className="dn-badge" aria-label={`${i.badge} new`}>{i.badge}</span> : null}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}

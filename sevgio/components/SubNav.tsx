"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SubNav({ links }: { links: [string, string, number?][] }) {
  const path = usePathname();
  const active = links.map(l => l[0]).filter(h => path === h || path.startsWith(h + "/")).sort((a, b) => b.length - a.length)[0];
  return (
    <nav className="subnav" aria-label="Section">
      {links.map(([href, label, badge]) => <Link key={href} href={href} aria-current={href === active ? "page" : undefined}>{label}{badge ? <span className="badge-new" aria-label={`${badge} new`}>{badge}</span> : null}</Link>)}
    </nav>
  );
}

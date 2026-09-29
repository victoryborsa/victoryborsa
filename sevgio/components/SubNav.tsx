"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SubNav({ links }: { links: [string, string][] }) {
  const path = usePathname();
  const active = links.map(l => l[0]).filter(h => path === h || path.startsWith(h + "/")).sort((a, b) => b.length - a.length)[0];
  return (
    <nav className="subnav" aria-label="Section">
      {links.map(([href, label]) => <Link key={href} href={href} aria-current={href === active ? "page" : undefined}>{label}</Link>)}
    </nav>
  );
}

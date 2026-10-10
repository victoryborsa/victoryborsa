"use client";
import { usePathname } from "next/navigation";

/** Header language picker. Plain links (not prefetched) so choosing a language reloads the page in it. */
export function LangMenu({ current, label, langs }: { current: string; label: string; langs: { code: string; name: string }[] }) {
  const path = usePathname() || "/";
  const now = langs.find(l => l.code === current);
  return (
    <details className="lang-menu">
      <summary aria-label={label}><span aria-hidden>🌐</span> {current.toUpperCase()}</summary>
      <ul>
        {langs.map(l => (
          <li key={l.code}><a href={`/lang/${l.code}?next=${encodeURIComponent(path)}`} rel="nofollow" hrefLang={l.code} lang={l.code} aria-current={l.code === now?.code ? "true" : undefined}>{l.name}</a></li>
        ))}
      </ul>
    </details>
  );
}

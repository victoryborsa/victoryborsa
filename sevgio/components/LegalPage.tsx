import Link from "next/link";
import { getSettings } from "@/lib/settings.ts";
import { mailUrl, telUrl } from "@/lib/links.ts";

export const LEGAL_LINKS: [string, string][] = [
  ["/privacy", "Privacy Policy"], ["/terms", "Terms & Conditions"], ["/cancellation-policy", "Cancellation Policy"],
  ["/accessibility", "Accessibility"], ["/host-terms", "Host Terms"], ["/photo-credits", "Photo credits"], ["/contact", "Contact"],
];

/** Shared frame for Sevgio's policy pages: same header, footer, fonts and colors as the rest of the site. */
export async function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: string; children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <div className="wrap page-pad theme-light legal">
      <nav className="legal-nav" aria-label="Policies">
        {LEGAL_LINKS.filter(([href]) => href !== "/contact").map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
      </nav>
      <article className="legal-body">
        <p className="eyebrow">Sevgio policies</p>
        <h1>{title}</h1>
        <p className="hint">Last updated {updated}</p>
        <p className="legal-intro">{intro}</p>
        {children}
        <section>
          <h2>Questions</h2>
          <p>Contact us any time{s.contact_email ? <> at <a href={mailUrl(s.contact_email)}>{s.contact_email}</a></> : null}{s.contact_phone ? <>{s.contact_email ? " or" : " at"} <a href={telUrl(s.contact_phone)}>{s.contact_phone}</a></> : null}, or use the <Link href="/contact">contact form</Link>.</p>
        </section>
      </article>
    </div>
  );
}

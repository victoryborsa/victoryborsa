import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { after } from "next/server";
import { maybeRunScheduledJobs } from "@/lib/scheduled.ts";
import { BrandLogo } from "@/components/BrandLogo.tsx";
import { mailUrl, telUrl } from "@/lib/links.ts";
import { Bricolage_Grotesque, Figtree, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "./polish.css";
import { currentUser } from "@/lib/auth.ts";
import { getSettings } from "@/lib/settings.ts";
import { signOutAction } from "./actions/auth.ts";
import { getT, LANGS_AZ } from "@/lib/i18n.ts";
import { LangMenu } from "@/components/LangMenu.tsx";
import { HostSwitch, UserMenu } from "@/components/UserMenu.tsx";
import { ProtectPage } from "@/components/ProtectPage.tsx";
import { SITE_DESCRIPTION } from "@/lib/seo.tsx";
import { LEGAL_LINKS } from "@/components/LegalPage.tsx";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-display", display: "swap" });
const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: { default: "Sevgio · Yinz Are Home in Pittsburgh", template: "%s · Sevgio" },
  description: SITE_DESCRIPTION,
  openGraph: { siteName: "Sevgio", type: "website", title: "Sevgio · Yinz Are Home in Pittsburgh", description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Sevgio · Yinz Are Home in Pittsburgh" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#101820" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, settings, { lang, t }] = await Promise.all([currentUser(), getSettings(), getT()]);
  // Hourly housekeeping (calendar sync, events, expiring requests) runs after the page is sent, never slowing it down.
  after(maybeRunScheduledJobs);
  return (
    <html lang={lang} className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        {settings.site_notice && <div className="site-notice"><div className="wrap">{settings.site_notice}</div></div>}
        <header className="site">
          <div className="wrap">
            <Link className="logo" href="/" aria-label="Sevgio home"><BrandLogo size={46} /></Link>
            <nav className="main" aria-label="Main">
              <Link className="navlink" href="/stays">{t("nav.stays")}</Link>
              <Link className="navlink" href="/events">{t("nav.events")}</Link>
              <Link className="navlink" href="/pittsburgh">{t("nav.guide")}</Link>
              <Link className="navlink" href="/corporate-housing">{t("nav.corporate")}</Link>
              {!user && (
                <>
                  <Link className="navlink" href="/signin">{t("nav.signin")}</Link>
                  <Link className="btn btn-primary btn-sm" href="/signup">{t("nav.signup")}</Link>
                </>
              )}
            </nav>
            <LangMenu current={lang} label={t("nav.language")} langs={LANGS_AZ.map(l => ({ code: l.code, name: l.name }))} />
            <HostSwitch role={user?.role ?? null} labels={{ become: t("nav.becomeHost"), toHosting: t("nav.toHosting"), toTraveling: t("nav.toTraveling") }} />
            <UserMenu
              main={[{ href: "/stays", label: t("nav.stays") }, { href: "/events", label: t("nav.events") }, { href: "/pittsburgh", label: t("nav.guide") }, { href: "/corporate-housing", label: t("nav.corporate") }]}
              items={[
                { href: "/contact", label: t("nav.contact") },
                ...(user?.role === "admin" ? [{ href: "/admin", label: t("nav.admin") }] : []),
                ...(user ? [{ href: "/trips", label: t("nav.trips") }, { href: "/account", label: t("nav.account") }] : []),
              ]}
              signedIn={!!user}
              initial={(user?.name || user?.email || "?").trim().charAt(0).toUpperCase()}
              signOut={signOutAction}
              labels={{ menu: t("nav.menu"), signout: t("nav.signout"), signin: t("nav.signin"), signup: t("nav.signup") }}
            />
          </div>
        </header>
        <main id="main" className="theme-light">{children}</main>
        <ProtectPage />
        <footer className="site">
          <div className="wrap">
            <div className="stack" style={{ gap: 6 }}>
              <BrandLogo size={36} />
              <span className="muted">{t("foot.tagline")}</span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">{t("foot.guests")}</span>
              <Link href="/stays">{t("foot.find")}</Link>
              <Link href="/events">{t("nav.events")}</Link>
              <Link href="/pittsburgh">{t("nav.guide")}</Link>
              <Link href="/corporate-housing">{t("nav.corporate")}</Link>
              <Link href="/trips">{t("nav.trips")}</Link>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">{t("foot.help")}</span>
              <Link href="/contact">{t("foot.contact")}</Link>
              {settings.contact_email && <a className="muted" href={mailUrl(settings.contact_email)}>✉️ {settings.contact_email}</a>}
              {settings.contact_phone && <a className="muted" href={telUrl(settings.contact_phone)}>📞 {settings.contact_phone}</a>}
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">{t("foot.hosts")}</span>
              <Link href="/host">{t("foot.hostSignin")}</Link>
            </div>
            <nav className="stack" style={{ gap: 6 }} aria-label="Policies">
              <span className="eyebrow">Policies</span>
              {LEGAL_LINKS.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
            </nav>
          </div>
          <div className="wrap foot-legal">© {new Date().getFullYear()} Sevgio. All rights reserved. The photos, text, design and layout of this website belong to Sevgio and may not be copied, reproduced or reused without written permission.</div>
        </footer>
      </body>
    </html>
  );
}

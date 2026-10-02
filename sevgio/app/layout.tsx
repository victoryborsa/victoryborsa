import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { after } from "next/server";
import { maybeRunScheduledJobs } from "@/lib/scheduled.ts";
import { Logo } from "@/components/Logo.tsx";
import { mailUrl, telUrl } from "@/lib/links.ts";
import { Bricolage_Grotesque, Figtree, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { currentUser } from "@/lib/auth.ts";
import { getSettings } from "@/lib/settings.ts";
import { signOutAction } from "./actions/auth.ts";
import { getT, LANGS } from "@/lib/i18n.ts";
import { LangMenu } from "@/components/LangMenu.tsx";
import { ProtectPage } from "@/components/ProtectPage.tsx";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-display", display: "swap" });
const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: { default: "Sevgio Stays · Yinz Are Home in Pittsburgh", template: "%s · Sevgio Stays" },
  description: "Cozy private rooms and whole houses in Pittsburgh, booked direct with your hosts.",
  openGraph: { siteName: "Sevgio Stays", type: "website", title: "Sevgio Stays · Yinz Are Home in Pittsburgh", description: "Cozy private rooms and whole houses in Pittsburgh, booked direct with your hosts." },
  twitter: { card: "summary_large_image", title: "Sevgio Stays · Yinz Are Home in Pittsburgh" },
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
            <Link className="logo logo-badge" href="/" aria-label="Sevgio Stays home"><Logo size={46} title="Sevgio Stays" /><span>sevgio <span className="logo-stays">stays</span></span></Link>
            <nav className="main" aria-label="Main">
              <Link className="navlink" href="/stays">{t("nav.stays")}</Link>
              <Link className="navlink" href="/events">{t("nav.events")}</Link>
              <Link className="navlink" href="/pittsburgh">{t("nav.guide")}</Link>
              <Link className="navlink" href="/contact">{t("nav.contact")}</Link>
              {user?.role === "host" && <Link className="navlink" href="/host">{t("nav.host")}</Link>}
              {user?.role === "admin" && <Link className="navlink" href="/admin">{t("nav.admin")}</Link>}
              {user ? (
                <>
                  <Link className="navlink" href="/trips">{t("nav.trips")}</Link>
                  <Link className="navlink" href="/account">{t("nav.account")}</Link>
                  <form action={signOutAction} className="inline-form"><button className="btn btn-ghost btn-sm" type="submit">{t("nav.signout")}</button></form>
                </>
              ) : (
                <>
                  <Link className="navlink" href="/signin">{t("nav.signin")}</Link>
                  <Link className="btn btn-primary btn-sm" href="/signup">{t("nav.signup")}</Link>
                </>
              )}
            </nav>
            <LangMenu current={lang} label={t("nav.language")} langs={LANGS.map(l => ({ code: l.code, name: l.name }))} />
          </div>
        </header>
        <main id="main">{children}</main>
        <ProtectPage />
        <footer className="site">
          <div className="wrap">
            <div className="stack" style={{ gap: 6 }}>
              <strong style={{ fontFamily: "var(--f-display)", fontSize: 18 }}>Sevgio Stays</strong>
              <span className="muted">{t("foot.tagline")}</span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">{t("foot.guests")}</span>
              <Link href="/stays">{t("foot.find")}</Link>
              <Link href="/events">{t("nav.events")}</Link>
              <Link href="/pittsburgh">{t("nav.guide")}</Link>
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
          </div>
          <div className="wrap foot-legal">© {new Date().getFullYear()} Sevgio Stays. All rights reserved. The photos, text, design and layout of this website belong to Sevgio Stays and may not be copied, reproduced or reused without written permission.</div>
        </footer>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, Figtree, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { currentUser } from "@/lib/auth.ts";
import { getSettings } from "@/lib/settings.ts";
import { signOutAction } from "./actions/auth.ts";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-display", display: "swap" });
const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: { default: "Sevgio · Vacation rentals across Pennsylvania", template: "%s · Sevgio" },
  description: "Book lake houses, city lofts, farm stays and mountain cabins across Pennsylvania directly with Sevgio.",
  openGraph: { siteName: "Sevgio", type: "website" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0A6B66" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([currentUser(), getSettings()]);
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        {settings.site_notice && <div className="site-notice"><div className="wrap">{settings.site_notice}</div></div>}
        <header className="site">
          <div className="wrap">
            <Link className="logo" href="/" aria-label="Sevgio home">sevgio<span className="dot" /></Link>
            <nav className="main" aria-label="Main">
              <Link className="navlink" href="/stays">Stays</Link>
              <Link className="navlink" href="/contact">Contact</Link>
              {user?.role === "host" && <Link className="navlink" href="/host">Host dashboard</Link>}
              {user?.role === "admin" && <Link className="navlink" href="/admin">Admin</Link>}
              {user ? (
                <>
                  <Link className="navlink" href="/trips">My trips</Link>
                  <Link className="navlink" href="/account">Account</Link>
                  <form action={signOutAction} className="inline-form"><button className="btn btn-ghost btn-sm" type="submit">Sign out</button></form>
                </>
              ) : (
                <>
                  <Link className="navlink" href="/signin">Sign in</Link>
                  <Link className="btn btn-primary btn-sm" href="/signup">Create account</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site">
          <div className="wrap">
            <div className="stack" style={{ gap: 6 }}>
              <strong style={{ fontFamily: "var(--f-display)", fontSize: 18 }}>sevgio</strong>
              <span className="muted">Vacation rentals across Pennsylvania, booked direct.</span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">Guests</span>
              <Link href="/stays">Find a stay</Link>
              <Link href="/trips">My trips</Link>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">Help</span>
              <Link href="/contact">Contact us</Link>
              {settings.contact_email && <span className="muted">{settings.contact_email}</span>}
              {settings.contact_phone && <span className="muted">{settings.contact_phone}</span>}
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">Hosts</span>
              <Link href="/host">Host sign in</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

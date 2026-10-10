import { NextResponse, type NextRequest } from "next/server";

// Programs made to download whole websites for copying. Calendar feeds and payment webhooks (/api) are never blocked.
const COPIERS = /HTTrack|WebCopier|WebZIP|Teleport ?Pro|Offline ?Explorer|SiteSnagger|WebReaper|Website ?Downloader|SiteSucker|Wget|WebStripper|WebWhacker|Website ?Extractor|Cyotek|A1 ?Website|Getleft|PageNest/i;

// Addresses from the previous sevgio.com website that Google or old links may still use, and the page that replaced each.
const OLD_SITE: Record<string, string> = {
  "/login": "/signin", "/register": "/signup", "/become-host": "/signup?host=1", "/help": "/contact", "/about": "/corporate-housing", "/contact-us": "/contact",
  "/terms-of-service": "/terms", "/policies": "/terms", "/cancellation-policies": "/cancellation-policy", "/guest-refund": "/cancellation-policy",
  "/search": "/stays", "/properties": "/stays", "/property/create": "/host", "/experience/create": "/host", "/mywishlist": "/stays",
  "/trips/active": "/trips", "/inbox": "/trips", "/users/profile": "/account", "/index.html": "/", "/home": "/",
};
const oldPage = (path: string) => OLD_SITE[path.replace(/\/+$/, "") || "/"] ?? (path.startsWith("/property/") ? "/stays" : path.startsWith("/experience/") ? "/pittsburgh" : null);

// One address for the whole site: www.sevgio.com goes to sevgio.com, and old addresses go to their new page, in a single permanent redirect.
const SITE = process.env.SITE_URL ? new URL(process.env.SITE_URL) : null;

export function middleware(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim().toLowerCase();
  const www = !!SITE && host === "www." + SITE.hostname;
  const moved = oldPage(req.nextUrl.pathname);
  if (www || moved) {
    const to = moved ?? req.nextUrl.pathname + req.nextUrl.search;
    // On the live domain the redirect names sevgio.com in full; anywhere else (test servers) it stays on the same address.
    return NextResponse.redirect(new URL(to, SITE && (www || host === SITE.hostname) ? SITE.origin : req.url), 301);
  }
  if (COPIERS.test(req.headers.get("user-agent") || "")) return new NextResponse("Copying this website is not allowed.", { status: 403 });
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"] };

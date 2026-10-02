import { NextResponse, type NextRequest } from "next/server";

// Programs made to download whole websites for copying. Calendar feeds and payment webhooks (/api) are never blocked.
const COPIERS = /HTTrack|WebCopier|WebZIP|Teleport ?Pro|Offline ?Explorer|SiteSnagger|WebReaper|Website ?Downloader|SiteSucker|Wget|WebStripper|WebWhacker|Website ?Extractor|Cyotek|A1 ?Website|Getleft|PageNest/i;

export function middleware(req: NextRequest) {
  if (COPIERS.test(req.headers.get("user-agent") || "")) return new NextResponse("Copying this website is not allowed.", { status: 403 });
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"] };

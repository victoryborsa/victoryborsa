import type { MetadataRoute } from "next";

// Signed-in areas and booking steps: search engines stay out. (Sign-in and password pages stay crawlable so engines can read their noindex tag.)
// "/host$" and "/host/" rather than "/host", which would also block the public /host-terms page.
const PRIVATE_PATHS = ["/admin", "/host$", "/host/", "/account", "/trips", "/book", "/api"];

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  // Listing and guide photos live under /api; search engines need them to show the pages and photos.
  const allow = ["/", "/api/photos/", "/api/site-photos/"];
  // Language links only set a cookie and bounce back to the same page.
  const disallow = [...PRIVATE_PATHS, "/lang/"];
  // Search engines are welcome (that's how guests find you), including ChatGPT search (OAI-SearchBot).
  // Crawlers that collect whole websites for AI training or copying are not.
  const copiers = ["GPTBot", "ChatGPT-User", "CCBot", "ClaudeBot", "anthropic-ai", "Google-Extended", "Bytespider", "PerplexityBot", "Amazonbot", "Applebot-Extended",
    "FacebookBot", "Meta-ExternalAgent", "Diffbot", "ImagesiftBot", "Omgilibot", "cohere-ai", "AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "HTTrack", "Wget"];
  return {
    rules: [
      { userAgent: "*", allow, disallow },
      { userAgent: ["Googlebot", "Bingbot", "OAI-SearchBot"], allow, disallow },
      { userAgent: copiers, disallow: "/" },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}

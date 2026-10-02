import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  // Search engines are welcome (that's how guests find you); AI and copying bots that take whole websites are not.
  const copiers = ["GPTBot", "ChatGPT-User", "CCBot", "ClaudeBot", "anthropic-ai", "Google-Extended", "Bytespider", "PerplexityBot", "Amazonbot", "Applebot-Extended",
    "FacebookBot", "Meta-ExternalAgent", "Diffbot", "ImagesiftBot", "Omgilibot", "cohere-ai", "AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "HTTrack", "Wget"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin", "/host", "/account", "/trips", "/book", "/api"] },
      { userAgent: copiers, disallow: "/" },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}

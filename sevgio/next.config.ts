import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // No other website may show these pages inside a frame of its own.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

// Signed-in areas and booking steps never appear in search results, even if a link to them is found.
const PRIVATE = ["/admin", "/host", "/account", "/trips", "/book", "/verify", "/reset", "/forgot", "/no-access", "/signin", "/signup"];

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "pg", "web-push"],
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...PRIVATE.map(p => ({ source: `${p}/:path*`, headers: [{ key: "X-Robots-Tag", value: "noindex" }] })),
      { source: "/img/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" }] },
      { source: "/icons/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" }] },
    ];
  },
};

export default config;

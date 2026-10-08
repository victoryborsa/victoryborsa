import type { MetadataRoute } from "next";
import { q } from "@/lib/db.ts";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const rows = await q<{ slug: string; updated_at: Date }>("SELECT slug, updated_at FROM properties WHERE status = 'published'");
  return [
    { url: base + "/", changeFrequency: "daily", priority: 1 },
    { url: base + "/stays", changeFrequency: "daily", priority: 0.9 },
    { url: base + "/corporate-housing", changeFrequency: "weekly", priority: 0.8 },
    { url: base + "/contact", changeFrequency: "monthly", priority: 0.3 },
    { url: base + "/pittsburgh", changeFrequency: "monthly", priority: 0.5 },
    { url: base + "/events", changeFrequency: "daily", priority: 0.5 },
    ...["/privacy", "/terms", "/cancellation-policy", "/accessibility", "/host-terms", "/photo-credits"].map(path => ({ url: base + path, changeFrequency: "yearly" as const, priority: 0.2 })),
    ...rows.map(r => ({ url: `${base}/stays/${r.slug}`, lastModified: r.updated_at, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}

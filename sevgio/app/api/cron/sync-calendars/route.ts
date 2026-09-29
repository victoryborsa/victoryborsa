import { q } from "@/lib/db.ts";
import { syncFeed } from "@/lib/calendar-sync.ts";
import { expireStaleRequests } from "@/lib/bookings.ts";

/** Called hourly by the host's scheduler (Vercel Cron, Render Cron, or any uptime pinger) with the CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") || new URL(req.url).searchParams.get("key");
  if (!secret || given !== secret) return new Response("Unauthorized", { status: 401 });
  const expired = await expireStaleRequests();
  const feeds = await q<{ id: string }>("SELECT id FROM ical_feeds ORDER BY last_synced_at NULLS FIRST LIMIT 200");
  let ok = 0, failed = 0;
  for (const f of feeds) (await syncFeed(f.id)).error ? failed++ : ok++;
  return Response.json({ feeds: feeds.length, ok, failed, expiredRequests: expired.length });
}

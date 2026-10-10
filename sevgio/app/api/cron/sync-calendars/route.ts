import { runScheduledJobs } from "@/lib/scheduled.ts";

/** Optional: an outside scheduler can call this with the CRON_SECRET. The site also runs the same jobs by itself every hour. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") || new URL(req.url).searchParams.get("key");
  if (!secret || given !== secret) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runScheduledJobs());
}

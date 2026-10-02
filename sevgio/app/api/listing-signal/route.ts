import { one } from "@/lib/db.ts";
import { currentUser } from "@/lib/auth.ts";
import { siteUrl } from "@/lib/email.ts";
import { listingStats, recordSignal, setFavorite, visitorKey } from "@/lib/signals.ts";

export const dynamic = "force-dynamic";

const hostOf = (u: string) => { try { return new URL(u).host; } catch { return null; } };
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;

/** The listing page reports views, Reserve clicks, shares and favourite taps here. Body: { slug, kind, channel?, on? } */
export async function POST(req: Request) {
  // Only our own pages may report (blocks other sites from padding the numbers).
  const origin = req.headers.get("origin");
  if (origin) {
    const ours = [req.headers.get("host"), req.headers.get("x-forwarded-host"), hostOf(siteUrl())];
    if (!ours.includes(hostOf(origin) ?? "-")) return Response.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { slug?: unknown; kind?: unknown; channel?: unknown; on?: unknown };
  try { body = JSON.parse(await req.text()); } catch { return Response.json({ error: "bad request" }, { status: 400 }); }
  const { slug, kind } = body;
  if (typeof slug !== "string" || !["view", "favorite", "interested", "share"].includes(kind as string)) return Response.json({ error: "bad request" }, { status: 400 });
  const p = await one<{ id: string; host_id: string }>("SELECT id, host_id FROM properties WHERE slug = $1 AND status = 'published'", [slug]);
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  // Search engines and link previews see the numbers but don't add to them.
  if (BOTS.test(req.headers.get("user-agent") || "")) return Response.json(await listingStats(p.id, null));
  const visitor = (await visitorKey(true))!;

  if (kind === "favorite") await setFavorite(p.id, visitor, body.on !== false);
  else {
    // Hosts and admins looking at their own listings don't count as views or interest.
    const u = await currentUser();
    const staff = !!u && (u.role === "admin" || u.id === p.host_id);
    if (!(staff && kind !== "share")) await recordSignal(p.id, kind as "view" | "interested" | "share", visitor, typeof body.channel === "string" ? body.channel : "");
  }
  return Response.json(await listingStats(p.id, visitor));
}

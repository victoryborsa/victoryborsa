import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { one, q } from "@/lib/db.ts";
import { currentUser } from "@/lib/auth.ts";
import { todayLocal } from "@/lib/dates.ts";
import { listingStats, VISITOR_COOKIE } from "@/lib/listing-stats.ts";

export const dynamic = "force-dynamic";

// Link-preview robots and search engines don't count as views.
const ROBOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|skype|headless|lighthouse/i;

/** Counts a view or a share, or switches "favourite" / "interested" on or off, then returns the listing's numbers. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { kind?: string; on?: boolean };
  const kind = body.kind;
  if (!["view", "share", "favorite", "interested"].includes(kind || "") || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "bad request" }, { status: 400 });
  const p = await one<{ id: string; host_id: string }>("SELECT id, host_id FROM properties WHERE id = $1 AND status = 'published'", [id]);
  if (!p) return Response.json({ error: "not found" }, { status: 404 });

  const jar = await cookies();
  let visitor = jar.get(VISITOR_COOKIE)?.value;
  if (!visitor || !/^[0-9a-f-]{36}$/i.test(visitor)) {
    visitor = randomUUID();
    jar.set(VISITOR_COOKIE, visitor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 730 });
  }
  const robot = ROBOTS.test(req.headers.get("user-agent") || "");
  if (kind === "view") {
    // The host and admins looking at their own listing don't add views.
    const u = await currentUser();
    if (!robot && !(u && (u.role === "admin" || u.id === p.host_id)))
      await q("INSERT INTO listing_activity (property_id, kind, visitor, day) VALUES ($1, 'view', $2, $3) ON CONFLICT DO NOTHING", [id, visitor, todayLocal()]);
  } else if (kind === "share") {
    if (!robot) await q("INSERT INTO listing_activity (property_id, kind, visitor, day) VALUES ($1, 'share', $2, $3) ON CONFLICT DO NOTHING", [id, visitor, todayLocal()]);
  } else if (body.on) {
    await q("INSERT INTO listing_activity (property_id, kind, visitor) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [id, kind, visitor]);
  } else {
    await q("DELETE FROM listing_activity WHERE property_id = $1 AND kind = $2 AND visitor = $3", [id, kind, visitor]);
  }
  return Response.json(await listingStats(id, visitor));
}

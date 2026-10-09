import { one, q } from "@/lib/db.ts";
import { buildIcs } from "@/lib/ical.ts";
import { RELATED } from "@/lib/bookings.ts";
import { todayLocal, addDays } from "@/lib/dates.ts";
import { after } from "next/server";
import { siteFromAgent } from "@/lib/ical-fetches.ts";

/**
 * Private calendar feed for one listing, for Airbnb / Vrbo / Booking.com to import. Shows only which nights are taken.
 * The link ends in ".ics" because some sites (Booking.com) insist on it; the old link without it still works.
 */
async function feed(tokenParam: string, agent = "") {
  const token = tokenParam.replace(/\.ics$/i, "");
  if (!/^[0-9a-f]{36}$/.test(token)) return null;
  const p = await one<{ id: string; title: string }>("SELECT id, title FROM properties WHERE ical_token = $1", [token]);
  if (!p) return null;
  // Remember which outside site read the link and when, so the host can see Airbnb, Booking.com and others are really checking it.
  const site = siteFromAgent(agent);
  if (site) after(() => q(`INSERT INTO ical_fetches (property_id, site, agent) VALUES ($1, $2, $3)
    ON CONFLICT (property_id, site) DO UPDATE SET last_at = now(), fetches = ical_fetches.fetches + 1, agent = EXCLUDED.agent`, [p.id, site, agent.slice(0, 200)]).catch(() => {}));
  const from = addDays(todayLocal(), -30);
  const bookings = await q<{ id: string; check_in: string; check_out: string }>(`SELECT id, check_in, check_out FROM bookings WHERE property_id IN ${RELATED("$1")} AND status IN ('pending','awaiting_payment','confirmed') AND check_out > $2`, [p.id, from]);
  // Blocks imported from other sites' calendar links are left out, so calendars don't echo each other's bookings back.
  // Host blocks and reservations entered by hand (source 'res:…') are sent.
  const blocks = await q<{ id: string; start_date: string; end_date: string }>(`SELECT id, start_date, end_date FROM blocks WHERE property_id IN ${RELATED("$1")} AND source NOT LIKE 'ical:%' AND end_date > $2`, [p.id, from]);
  const events = [
    ...bookings.map(b => ({ uid: "b-" + b.id, start: b.check_in, end: b.check_out, summary: "Booked on Sevgio" })),
    ...blocks.map(b => ({ uid: "k-" + b.id, start: b.start_date, end: b.end_date, summary: "Not available" })),
  ];
  // Some sites reject a calendar with no events at all. A one-night marker in the past never blocks anything.
  if (!events.length) events.push({ uid: `placeholder-${p.id}`, start: "2000-01-01", end: "2000-01-02", summary: "Sevgio calendar" });
  return buildIcs(`Sevgio: ${p.title}`, events);
}

const headers = { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="sevgio.ics"', "Cache-Control": "no-store" };

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ics = await feed((await params).token, req.headers.get("user-agent") || "");
  return ics ? new Response(ics, { headers }) : new Response("Not found", { status: 404 });
}

export async function HEAD(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const ics = await feed((await params).token);
  return new Response(null, { status: ics ? 200 : 404, headers: ics ? headers : {} });
}

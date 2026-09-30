import { one, q } from "@/lib/db.ts";
import { buildIcs } from "@/lib/ical.ts";
import { RELATED } from "@/lib/bookings.ts";
import { todayLocal, addDays } from "@/lib/dates.ts";

/** Private calendar feed for one listing, for other booking sites to import. Shows only which nights are taken. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{36}$/.test(token)) return new Response("Not found", { status: 404 });
  const p = await one<{ id: string; title: string }>("SELECT id, title FROM properties WHERE ical_token = $1", [token]);
  if (!p) return new Response("Not found", { status: 404 });
  const from = addDays(todayLocal(), -30);
  const bookings = await q<{ id: string; check_in: string; check_out: string }>(`SELECT id, check_in, check_out FROM bookings WHERE property_id IN ${RELATED("$1")} AND status IN ('pending','confirmed') AND check_out > $2`, [p.id, from]);
  // Blocks imported from other sites are left out, so calendars don't echo each other's bookings back.
  const blocks = await q<{ id: string; start_date: string; end_date: string }>(`SELECT id, start_date, end_date FROM blocks WHERE property_id IN ${RELATED("$1")} AND source = 'host' AND end_date > $2`, [p.id, from]);
  const ics = buildIcs(`Sevgio: ${p.title}`, [
    ...bookings.map(b => ({ uid: "b-" + b.id, start: b.check_in, end: b.check_out, summary: "Booked on Sevgio" })),
    ...blocks.map(b => ({ uid: "k-" + b.id, start: b.start_date, end: b.end_date, summary: "Not available" })),
  ]);
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
}

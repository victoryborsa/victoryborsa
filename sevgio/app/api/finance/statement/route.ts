import { currentUser } from "@/lib/auth.ts";
import { financeListings, readFilters, reportRows, statementCsv } from "@/lib/finance.ts";

/** Reservations statement as a spreadsheet, with the same filters and totals as the Finance page. Hosts get only their own listings; admins get all. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || !["host", "admin"].includes(u.role)) return new Response("Sign in as a host or admin.", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const listings = await financeListings(u);
  const f = readFilters(sp, listings);
  const csv = statementCsv(await reportRows(listings, f));
  const place = listings.find(l => l.id === (f.room || f.property));
  const name = `sevgio-statement-${f.from}-to-${f.to}${place ? "-" + place.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) : ""}${f.channel ? "-" + f.channel : ""}.csv`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}

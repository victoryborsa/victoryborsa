import { currentUser } from "@/lib/auth.ts";
import { financeProperties, statement, statementCsv, validMonth } from "@/lib/finance.ts";
import { todayLocal } from "@/lib/dates.ts";

/** Reservations statement as a spreadsheet. Hosts get only their own listings; admins get all. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || !["host", "admin"].includes(u.role)) return new Response("Sign in as a host or admin.", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const month = validMonth(sp.get("month")) ? sp.get("month")! : todayLocal().slice(0, 7);
  const props = await financeProperties(u);
  const property = props.find(p => p.id === sp.get("property")) || null;
  const csv = statementCsv(await statement(u, month, property?.id ?? null));
  const name = `sevgio-statement-${month}${property ? "-" + property.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) : ""}.csv`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}

import { currentUser } from "@/lib/auth.ts";
import { exportListings } from "@/lib/export-listings.ts";
import { todayLocal } from "@/lib/dates.ts";

export const dynamic = "force-dynamic";

/** Admins download every listing as a .json file in the Import format. */
export async function GET() {
  const u = await currentUser();
  if (!u || u.role !== "admin") return new Response("Admins only.", { status: 403 });
  const listings = await exportListings();
  const body = JSON.stringify({ exported_from: "Sevgio", exported_on: todayLocal(), count: listings.length, listings }, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="sevgio-listings-${todayLocal()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

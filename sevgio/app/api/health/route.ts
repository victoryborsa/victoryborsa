import { one } from "@/lib/db.ts";
import { deployVersion } from "@/lib/log.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await one("SELECT 1");
    return Response.json({ ok: true, version: deployVersion() });
  } catch {
    return Response.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }
}

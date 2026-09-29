import { one } from "@/lib/db.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await one("SELECT 1");
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }
}

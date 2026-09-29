import { one } from "@/lib/db.ts";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const size = new URL(req.url).searchParams.get("s") === "thumb" ? "thumb" : "large";
  const row = await one<{ data: Buffer }>(`SELECT ${size} AS data FROM photos WHERE id = $1`, [id]);
  if (!row) return new Response("Not found", { status: 404 });
  // Photo ids never change content, so browsers and CDNs can cache them for a year.
  return new Response(new Uint8Array(row.data), { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" } });
}

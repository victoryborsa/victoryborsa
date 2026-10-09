import sharp from "sharp";
import { one } from "@/lib/db.ts";

// Phone-sized copies (1000px wide) are made from the large photo the first time they're asked for, and kept in memory.
const medium = new Map<string, Buffer>();
const MEDIUM_KEEP = 150;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const s = new URL(req.url).searchParams.get("s");
  const size = s === "thumb" ? "thumb" : s === "medium" ? "medium" : "large";
  let data = size === "medium" ? medium.get(id) : undefined;
  if (!data) {
    const row = await one<{ data: Buffer }>(`SELECT ${size === "thumb" ? "thumb" : "large"} AS data FROM photos WHERE id = $1`, [id]);
    if (!row) return new Response("Not found", { status: 404 });
    data = row.data;
    if (size === "medium") {
      data = await sharp(row.data).resize({ width: 1000, withoutEnlargement: true }).webp({ quality: 76 }).toBuffer().catch(() => row.data);
      if (medium.size >= MEDIUM_KEEP) medium.delete(medium.keys().next().value!);
      medium.set(id, data);
    }
  }
  // Photo ids never change content, so browsers and CDNs can cache them for a year.
  return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/webp", "Content-Disposition": "inline", "Cache-Control": "public, max-age=31536000, immutable" } });
}

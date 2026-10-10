import "server-only";
import sharp from "sharp";

const MAX_BYTES = 20 * 1024 * 1024;

/** Resizes an upload into a large and a thumbnail WebP. Strips location metadata from the original. */
export async function processPhoto(file: File): Promise<{ large: Buffer; thumb: Buffer; width: number; height: number } | { error: string }> {
  if (!file || file.size === 0) return { error: "Choose a photo to upload." };
  if (file.size > MAX_BYTES) return { error: `${file.name} is larger than 20 MB.` };
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const base = sharp(input, { failOn: "error" }).rotate();
    const large = await base.clone().resize({ width: 1800, height: 1400, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    const thumb = await base.clone().resize({ width: 720, height: 540, fit: "cover" }).webp({ quality: 74 }).toBuffer();
    return { large: large.data, thumb, width: large.info.width, height: large.info.height };
  } catch {
    return { error: `${file.name} isn't a photo we can read. Use JPG, PNG, WebP or HEIC.` };
  }
}

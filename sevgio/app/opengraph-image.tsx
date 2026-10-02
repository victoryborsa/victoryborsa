import { ImageResponse } from "next/og";
import sharp from "sharp";
import { one } from "@/lib/db.ts";

// The picture shown when someone shares a Sevgio Stays link (WhatsApp, Facebook, iMessage, X…).
// Listing pages use their own cover photo; every other page uses this.
export const alt = "Sevgio Stays · Yinz Are Home in Pittsburgh";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const GOLD = "#FFB612";

/** The drawn skyline with the three yellow bridges, as a picture (used until a real Pittsburgh photo is uploaded). */
function skylineSvg(): string {
  const W = 1200, H = 630, base = 470;
  const b: [number, number, number, string?][] = [[40, 82, 220], [140, 74, 280], [232, 96, 190], [346, 68, 260], [432, 96, 250, "ppg"], [546, 82, 210], [646, 90, 230, "gulf"], [754, 76, 290], [848, 104, 220], [970, 82, 270]];
  const win = (x: number, y: number, w: number, h: number, seed: number) => {
    let out = "";
    for (let r = y + 18; r < y + h - 18; r += 28) for (let c = x + 12; c < x + w - 16; c += 22) if (((r * 7 + c * 13 + seed) % 5) < 2) out += `<rect x="${c}" y="${r}" width="9" height="12" fill="${GOLD}" opacity=".85"/>`;
    return out;
  };
  const towers = b.map(([x, w, h, kind], i) => {
    const top = base - h;
    let extra = "";
    if (kind === "ppg") extra = [0, 24, 48, 72].map(d => `<polygon points="${x + d},${top} ${x + d + 12},${top - 38} ${x + d + 24},${top}" fill="#1E2C3E"/>`).join("");
    if (kind === "gulf") extra = `<rect x="${x + 10}" y="${top - 16}" width="${w - 20}" height="16" fill="#101820"/><rect x="${x + 20}" y="${top - 32}" width="${w - 40}" height="16" fill="#101820"/><rect x="${x + 30}" y="${top - 48}" width="${w - 60}" height="16" fill="#101820"/><rect x="${x + w / 2 - 5}" y="${top - 58}" width="10" height="10" fill="#E5484D"/>`;
    return `<rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${kind === "ppg" ? "#1E2C3E" : "#101820"}"/>${extra}${win(x, top, w, h, i)}`;
  }).join("");
  const bridge = (a: number, z: number) => {
    let s = `<line x1="${a}" y1="500" x2="${z}" y2="500" stroke="${GOLD}" stroke-width="9"/><path d="M${a},500 Q${(a + z) / 2},400 ${z},500" stroke="${GOLD}" stroke-width="6" fill="none"/>`;
    for (let k = 1; k < 8; k++) { const x = a + ((z - a) * k) / 8, t = k / 8; s += `<line x1="${x}" y1="${500 - 200 * t * (1 - t)}" x2="${x}" y2="500" stroke="${GOLD}" stroke-width="3"/>`; }
    return s + `<line x1="${a}" y1="500" x2="${a}" y2="550" stroke="${GOLD}" stroke-width="9"/><line x1="${z}" y1="500" x2="${z}" y2="550" stroke="${GOLD}" stroke-width="9"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B2A4A"/><stop offset=".6" stop-color="#6B4A7A"/><stop offset="1" stop-color="#F2A65A"/></linearGradient>
    <linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B4C7E"/><stop offset="1" stop-color="#152640"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#d)"/><circle cx="1110" cy="150" r="36" fill="#FFE8B0" opacity=".9"/>${towers}
    <rect y="${base}" width="${W}" height="${H - base}" fill="url(#r)"/>${bridge(40, 400)}${bridge(420, 780)}${bridge(800, 1160)}</svg>`;
}

// Where each skyline building's roof is, for the gold P-I-T-T-S-B-U-R-G-H letters on top.
const LETTERS: [number, number][] = [[81, 250], [177, 190], [280, 280], [380, 210], [480, 182], [587, 260], [691, 182], [792, 180], [900, 250], [1011, 200]];

async function background(): Promise<{ src: string; drawn: boolean }> {
  try {
    const photo = await one<{ large: Buffer }>("SELECT large FROM site_photos WHERE slot IS NULL OR slot = 'guide-banner' ORDER BY (slot IS NULL) DESC, position, created_at LIMIT 1");
    const input = photo ? photo.large : Buffer.from(skylineSvg());
    const jpg = await sharp(input).resize(1200, 630, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
    return { src: `data:image/jpeg;base64,${jpg.toString("base64")}`, drawn: !photo };
  } catch {
    const jpg = await sharp(Buffer.from(skylineSvg())).jpeg({ quality: 82 }).toBuffer();
    return { src: `data:image/jpeg;base64,${jpg.toString("base64")}`, drawn: true };
  }
}

export default async function OpenGraphImage() {
  const { src: bg, drawn } = await background();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", fontFamily: "sans-serif" }}>
        <img src={bg} width={1200} height={630} style={{ position: "absolute", inset: 0, objectFit: "cover" }} alt="" />
        {drawn && LETTERS.map(([x, y], i) => (
          <div key={i} style={{ position: "absolute", left: x - 30, top: y - 62, width: 60, display: "flex", justifyContent: "center", fontSize: 46, fontWeight: 700, color: GOLD }}>{"PITTSBURGH"[i]}</div>
        ))}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 250, display: "flex", background: "linear-gradient(180deg, rgba(11,16,21,0) 0%, rgba(11,16,21,.55) 45%, rgba(11,16,21,.85) 100%)" }} />
        <div style={{ position: "absolute", left: 56, bottom: 48, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: "#fff", letterSpacing: -2 }}>
            sevgio<span style={{ color: GOLD, marginLeft: 18 }}>stays</span>
          </div>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: GOLD, marginTop: 4 }}>Yinz Are Home in Pittsburgh</div>
          <div style={{ display: "flex", fontSize: 26, color: "#E8ECEF", marginTop: 10 }}>Private rooms and whole homes · Book direct with your hosts</div>
        </div>
      </div>
    ),
    size,
  );
}

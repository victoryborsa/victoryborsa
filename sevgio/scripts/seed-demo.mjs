// Adds six sample Pennsylvania listings with illustrated photos so you can try the site.
// Demo accounts use @demo.sevgio.com emails. Remove everything with: npm run seed:demo -- --remove
import pg from "pg";
import sharp from "sharp";
import bcrypt from "bcryptjs";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

if (process.argv.includes("--remove")) {
  const ids = (await client.query("SELECT id FROM users WHERE email LIKE '%@demo.sevgio.com'")).rows.map(r => r.id);
  await client.query("DELETE FROM bookings WHERE guest_id = ANY($1) OR property_id IN (SELECT id FROM properties WHERE host_id = ANY($1))", [ids]);
  await client.query("DELETE FROM properties WHERE host_id = ANY($1)", [ids]);
  await client.query("DELETE FROM users WHERE id = ANY($1)", [ids]);
  console.log("Demo data removed.");
  await client.end();
  process.exit(0);
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let gid = 0;
function scene(p, kind) {
  const c = p.sc, id = "g" + (++gid);
  const sky = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.sky[0]}"/><stop offset="1" stop-color="${c.sky[1]}"/></linearGradient></defs>`;
  const open = `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(p.name)}, ${kind || "exterior"} (illustration)" xmlns="http://www.w3.org/2000/svg">${sky}`;
  if (kind && kind !== "exterior" && kind !== "view") {
    // Interior: wall, floor, a window onto the sky, then furniture for the room type.
    let f = "";
    if (kind === "bedroom") f = `<rect x="150" y="160" width="190" height="50" rx="6" fill="#FFFFFF"/><rect x="150" y="150" width="190" height="16" rx="6" fill="${c.accent}"/><rect x="330" y="120" width="14" height="92" rx="4" fill="#6B5444"/><rect x="160" y="140" width="50" height="18" rx="8" fill="#F2EEE6"/><rect x="220" y="140" width="50" height="18" rx="8" fill="#F2EEE6"/>`;
    else if (kind === "kitchen") f = `<rect x="0" y="160" width="400" height="60" fill="#FFFFFF"/><rect x="0" y="156" width="400" height="8" fill="${c.accent}"/><rect x="40" y="172" width="60" height="40" rx="3" fill="#EDE7DD"/><rect x="120" y="172" width="60" height="40" rx="3" fill="#EDE7DD"/><rect x="300" y="120" width="30" height="36" rx="4" fill="#C9D3D0"/><circle cx="250" cy="148" r="8" fill="${c.accent}"/>`;
    else f = `<rect x="70" y="170" width="220" height="40" rx="10" fill="${c.accent}"/><rect x="70" y="146" width="220" height="30" rx="10" fill="${c.accent}" opacity=".85"/><rect x="60" y="160" width="20" height="50" rx="8" fill="${c.accent}"/><rect x="280" y="160" width="20" height="50" rx="8" fill="${c.accent}"/><ellipse cx="180" cy="236" rx="140" ry="12" fill="#FFFFFF" opacity=".5"/><rect x="330" y="150" width="40" height="60" rx="4" fill="#7D6450"/><circle cx="350" cy="130" r="22" fill="#6E8F5C"/>`;
    return open + `<rect width="400" height="260" fill="${c.wall}"/><rect y="215" width="400" height="45" fill="#B89C7E"/><rect x="120" y="30" width="160" height="100" rx="4" fill="url(#${id})"/><rect x="120" y="30" width="160" height="100" rx="4" fill="none" stroke="#FFFFFF" stroke-width="6"/><line x1="200" y1="30" x2="200" y2="130" stroke="#FFFFFF" stroke-width="4"/>` + f + `</svg>`;
  }
  let s = `<rect width="400" height="260" fill="url(#${id})"/><circle cx="${kind === "view" ? 90 : 320}" cy="62" r="24" fill="#FFF4D6" opacity=".9"/>`;
  if (c.kind === "sea") s += `<path d="M0 150 Q70 118 140 140 T300 128 T400 138 V260 H0Z" fill="${c.land}" opacity=".55"/><rect y="170" width="400" height="90" fill="${c.sea}"/><path d="M0 182 H400" stroke="#FFFFFF" stroke-opacity=".25" stroke-width="2"/>`;
  else if (c.kind === "hills") s += `<path d="M0 170 Q90 120 190 160 T400 150 V260 H0Z" fill="${c.land}" opacity=".7"/><path d="M0 200 Q120 160 240 190 T400 185 V260 H0Z" fill="${c.land}"/><path d="M0 230 H400" stroke="#FFFFFF" stroke-opacity=".25" stroke-width="2"/><rect x="300" y="140" width="34" height="50" fill="${c.accent}"/><path d="M296 142 L317 118 L338 142Z" fill="#5A4636"/>`;
  else if (c.kind === "forest") s += `<path d="M0 200 L20 140 L40 200Z M30 200 L55 120 L80 200Z M300 200 L325 110 L350 200Z M340 200 L365 130 L390 200Z M370 200 L392 150 L414 200Z" fill="${c.land}"/><rect y="196" width="400" height="64" fill="#5E7F4E"/>`;
  else s += `<rect x="0" y="120" width="40" height="80" fill="${c.land}" opacity=".6"/><rect x="330" y="96" width="36" height="104" fill="${c.land}" opacity=".55"/><rect x="370" y="130" width="30" height="70" fill="${c.land}" opacity=".7"/><rect y="176" width="400" height="84" fill="${c.sea}" opacity=".85"/>`;
  if (kind === "view") return open + s + `<rect y="220" width="400" height="40" fill="${c.wall}"/><rect y="212" width="400" height="8" fill="#FFFFFF" opacity=".8"/></svg>`;
  if (p.type === "villa") s += `<rect x="90" y="120" width="190" height="70" fill="${c.wall}"/><rect x="80" y="112" width="210" height="10" fill="#FFFFFF"/><rect x="110" y="140" width="30" height="36" fill="#3D5A6C"/><rect x="160" y="140" width="50" height="50" fill="#3D5A6C"/><rect x="230" y="140" width="30" height="36" fill="#3D5A6C"/><rect x="100" y="196" width="200" height="22" rx="3" fill="#5CC1D6"/><circle cx="60" cy="176" r="22" fill="${c.accent}"/><rect x="57" y="178" width="6" height="22" fill="#6B5444"/>`;
  else if (p.type === "apartment") s += `<rect x="120" y="70" width="80" height="120" fill="${c.wall}"/><rect x="200" y="96" width="70" height="94" fill="${c.wall}" opacity=".85"/>` + [0,1,2,3].map(r => [0,1,2].map(k => `<rect x="${130 + k * 24}" y="${82 + r * 26}" width="14" height="16" fill="#3D5A6C"/>`).join("")).join("") + `<rect x="112" y="64" width="96" height="8" fill="${c.accent}"/>`;
  else if (p.type === "cabin") s += `<rect x="120" y="140" width="140" height="60" fill="${c.wall}"/><path d="M106 144 L190 88 L274 144Z" fill="#5A3A26"/><rect x="176" y="160" width="26" height="40" fill="#3B271A"/><rect x="136" y="156" width="24" height="20" fill="#F6D48B"/><rect x="220" y="156" width="24" height="20" fill="#F6D48B"/><rect x="226" y="98" width="12" height="26" fill="#6B5444"/>`;
  else s += `<rect x="130" y="112" width="120" height="78" fill="${c.wall}"/><path d="M122 116 L190 76 L258 116Z" fill="${c.accent}"/><rect x="150" y="134" width="22" height="24" fill="#2F6E8E"/><rect x="208" y="134" width="22" height="24" fill="#2F6E8E"/><rect x="180" y="160" width="20" height="30" fill="#2F6E8E"/><path d="M250 140 q20 -20 40 0" stroke="#C94F7C" stroke-width="10" fill="none" stroke-linecap="round"/>`;
  return open + s + `</svg>`;
}

const props = [
      { id: "p1", host: "u2", name: "Lake Harmony Lodge", city: "Lake Harmony", region: "Poconos", type: "villa", guests: 10, bedrooms: 4, beds: 6, baths: 3, rating: 4.93, reviews: 128, price: 385, cleaning: 150, minNights: 2, instant: true, active: true, cancel: "moderate",
        amen: ["wifi","hottub","ac","kitchen","parking","seaview","washer","fireplace","terrace"],
        rules: ["No parties or events", "Quiet hours 10 pm–8 am", "No smoking indoors", "Hot tub is unsupervised; children must be accompanied"],
        checkIn: "4:00 pm", checkOut: "11:00 am",
        desc: "A four-bedroom lodge a short walk from the lake, with a stone fireplace, a big kitchen and a deck with a hot tub. In winter the ski slopes are a few minutes' drive away; in summer, spend the day on the water and the evening around the fire pit. Plenty of room for two families or a group of friends.",
        sc: { sky: ["#8DB8D6", "#EAF1EC"], land: "#5F7F55", sea: "#3F7391", wall: "#8A6246", accent: "#3E5F3A", kind: "sea" } },
      { id: "p2", host: "u3", name: "Rittenhouse Square Loft", city: "Philadelphia", region: "Center City", type: "apartment", guests: 4, bedrooms: 2, beds: 2, baths: 1, rating: 4.81, reviews: 214, price: 179, cleaning: 60, minNights: 2, instant: true, active: true, cancel: "flexible",
        amen: ["wifi","ac","kitchen","washer","workspace"],
        rules: ["No parties or events", "Third-floor walk-up, no elevator", "Quiet hours 10 pm–8 am", "No smoking"],
        checkIn: "3:00 pm", checkOut: "11:00 am",
        desc: "A bright top-floor loft in a brick rowhouse a few blocks from Rittenhouse Square. Exposed brick, tall windows, a full kitchen and a desk for remote work. Walk to restaurants, museums and the Schuylkill River Trail; the subway and regional rail are close by.",
        sc: { sky: ["#F1B58A", "#F6E3C4"], land: "#8C6B5A", sea: "#7C8C96", wall: "#B5654A", accent: "#6E3B2C", kind: "city" } },
      { id: "p3", host: "u2", name: "Lancaster County Farmhouse Suite", city: "Strasburg", region: "Lancaster County", type: "house", guests: 2, bedrooms: 1, beds: 1, baths: 1, rating: 4.97, reviews: 96, price: 145, cleaning: 40, minNights: 2, instant: false, active: true, cancel: "firm",
        amen: ["wifi","ac","fireplace","parking","terrace"],
        rules: ["Adults only", "No smoking", "Working farm: please stay out of the barns", "Late check-in after 9 pm by arrangement"],
        checkIn: "3:00 pm", checkOut: "11:00 am",
        desc: "A private suite in a restored stone farmhouse surrounded by fields. It has a queen bed, a gas fireplace and a porch facing the sunset. The host leaves fresh eggs and bread for breakfast. Local markets, bike routes and the heritage railroad are a short drive away.",
        sc: { sky: ["#F2B48A", "#FBE6C8"], land: "#7FA05A", sea: "#7FA05A", wall: "#E9DFCF", accent: "#9C3B2E", kind: "hills" } },
      { id: "p4", host: "u3", name: "Mount Washington View House", city: "Pittsburgh", region: "Mount Washington", type: "house", guests: 6, bedrooms: 3, beds: 4, baths: 2, rating: 4.88, reviews: 73, price: 215, cleaning: 85, minNights: 2, instant: true, active: true, cancel: "moderate",
        amen: ["wifi","ac","kitchen","seaview","terrace","washer","parking"],
        rules: ["No parties or events", "No pets", "Quiet hours 10 pm–8 am"],
        checkIn: "3:00 pm", checkOut: "10:30 am",
        desc: "A renovated three-bedroom house on Mount Washington with a back deck that looks over the rivers and downtown skyline. Walk to Grandview Avenue and the inclines, or drive downtown in about ten minutes. Off-street parking for one car.",
        sc: { sky: ["#6FA8CF", "#DCEBF3"], land: "#6D7780", sea: "#3E6F8C", wall: "#E8E2D8", accent: "#2F4F6E", kind: "sea" } },
      { id: "p5", host: "u2", name: "Jim Thorpe Mountain Cabin", city: "Jim Thorpe", region: "Poconos", type: "cabin", guests: 5, bedrooms: 2, beds: 3, baths: 1, rating: 4.76, reviews: 41, price: 160, cleaning: 55, minNights: 2, instant: true, active: true, cancel: "flexible",
        amen: ["wifi","fireplace","kitchen","parking","pets","hottub"],
        rules: ["Dogs welcome (max 2)", "No parties", "Keep the wood-stove door closed when unattended"],
        checkIn: "3:00 pm", checkOut: "11:00 am",
        desc: "A timber cabin in the woods above Jim Thorpe, with a wood stove, an outdoor hot tub and a fenced yard for dogs. Hike or bike the Lehigh Gorge trails, go rafting in summer, or spend an afternoon in the historic downtown ten minutes away.",
        sc: { sky: ["#9CC3D5", "#E8F0E6"], land: "#3F6B4A", sea: "#3F6B4A", wall: "#8A5A3B", accent: "#2E4F37", kind: "forest" } },
      { id: "p6", host: "u3", name: "Downtown State College Condo", city: "State College", region: "Centre County", type: "apartment", guests: 4, bedrooms: 2, beds: 2, baths: 1, rating: null, reviews: 0, price: 125, cleaning: 50, minNights: 2, instant: true, active: true, cancel: "flexible",
        amen: ["wifi","ac","kitchen","parking","washer","workspace"],
        rules: ["No smoking", "No parties", "One reserved parking space"],
        checkIn: "3:00 pm", checkOut: "11:00 am",
        desc: "A two-bedroom condo downtown, a short walk from campus, restaurants and shops. Good for visiting families and game weekends. Includes one reserved parking space and a washer and dryer.",
        sc: { sky: ["#8FB9D8", "#E6F0F5"], land: "#8A96A0", sea: "#6E8FA3", wall: "#EDE8E0", accent: "#2B4A7A", kind: "city" } }

];
const TYPE = { villa: "lodge", apartment: "apartment", house: "house", cabin: "cabin" };
const KINDS = [["exterior", "Outside"], ["living", "Living room"], ["bedroom", "Bedroom"], ["kitchen", "Kitchen"], ["view", "The view"]];

const demoPassword = process.env.DEMO_PASSWORD || "demo-password-2026";
const password = await bcrypt.hash(demoPassword, 12);
const users = {
  u1: ["Sarah Miller", "guest@demo.sevgio.com", "customer"],
  u2: ["Dana Brooks", "dana@demo.sevgio.com", "host"],
  u3: ["Marcus Reed", "marcus@demo.sevgio.com", "host"],
};
const ids = {};
for (const [k, [name, email, role]] of Object.entries(users)) {
  const r = await client.query(
    "INSERT INTO users (email, name, password_hash, role, phone, email_verified_at) VALUES ($1, $2, $3, $4, '(570) 555-0100', now()) ON CONFLICT ((lower(email))) DO UPDATE SET name = EXCLUDED.name RETURNING id",
    [email, name, password, role],
  );
  ids[k] = r.rows[0].id;
}

for (const p of props) {
  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if ((await client.query("SELECT 1 FROM properties WHERE slug = $1", [slug])).rowCount) { console.log("Exists:", p.name); continue; }
  const amen = p.amen.map(a => ({ seaview: "waterview", terrace: "deck" }[a] || a));
  const r = await client.query(
    `INSERT INTO properties (slug, host_id, title, property_type, city, area, description, max_guests, bedrooms, beds, bathrooms, nightly_price_cents, cleaning_fee_cents, min_nights, max_nights,
       booking_mode, cancellation_policy, check_in_time, check_out_time, amenities, house_rules, arrival_instructions, status, rating, review_count, address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,30,$15,$16,$17,$18,$19,$20,'Demo listing: arrival instructions would go here.','published',$21,$22,'Demo address')
     RETURNING id`,
    [slug, ids[p.host], p.name, TYPE[p.type] || "house", p.city, p.region, p.desc, p.guests, p.bedrooms, p.beds, p.baths, p.price * 100, p.cleaning * 100, p.minNights,
      p.instant ? "instant" : "request", p.cancel, p.checkIn, p.checkOut, amen, p.rules, p.rating, p.reviews],
  );
  let pos = 0;
  for (const [kind, caption] of KINDS) {
    const svg = Buffer.from(scene(p, kind).replace("<svg ", '<svg width="1600" height="1040" '));
    const large = await sharp(svg).resize(1600, 1040).webp({ quality: 82 }).toBuffer();
    const thumb = await sharp(svg).resize(720, 540, { fit: "cover" }).webp({ quality: 76 }).toBuffer();
    await client.query("INSERT INTO photos (property_id, position, caption, large, thumb, width, height) VALUES ($1,$2,$3,$4,$5,1600,1040)", [r.rows[0].id, pos++, caption + " (illustration)", large, thumb]);
  }
  console.log("Added:", p.name);
}
console.log(process.env.DEMO_PASSWORD ? "\nDemo accounts created with a private password." : "\nDemo accounts (password: demo-password-2026): guest@demo.sevgio.com, dana@demo.sevgio.com, marcus@demo.sevgio.com");
await client.end();

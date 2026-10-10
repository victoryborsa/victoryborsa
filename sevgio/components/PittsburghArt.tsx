// Drawn Pittsburgh scenes. They always play in the slideshows, after any uploaded photos.
const GOLD = "#FFB612";

function windows(x: number, y: number, w: number, h: number, seed: number) {
  const out = [];
  for (let r = y + 6; r < y + h - 6; r += 9)
    for (let c = x + 4; c < x + w - 5; c += 7)
      if (((r * 7 + c * 13 + seed) % 5) < 2) out.push(<rect key={`${r}-${c}`} x={c} y={r} width="3" height="4" fill={GOLD} opacity=".85" />);
  return out;
}

/** Downtown at dusk: ten buildings spelling P-I-T-T-S-B-U-R-G-H (PPG Place and the Gulf Tower among them) above the three yellow bridges. */
export function SkylineArt() {
  type B = { x: number; w: number; h: number; kind?: "ppg" | "gulf" };
  const buildings: B[] = [
    { x: 12, w: 22, h: 70 }, { x: 38, w: 20, h: 88 }, { x: 62, w: 26, h: 60 }, { x: 92, w: 18, h: 82 },
    { x: 114, w: 26, h: 80, kind: "ppg" }, { x: 146, w: 22, h: 68 }, { x: 172, w: 24, h: 74, kind: "gulf" },
    { x: 200, w: 20, h: 92 }, { x: 224, w: 28, h: 72 }, { x: 256, w: 22, h: 86 },
  ];
  const roof = (b: B) => 150 - b.h - (b.kind === "ppg" ? 12 : b.kind === "gulf" ? 18 : 0);
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="pa-dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1B2A4A" /><stop offset=".6" stopColor="#6B4A7A" /><stop offset="1" stopColor="#F2A65A" /></linearGradient>
        <linearGradient id="pa-river" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2B4C7E" /><stop offset="1" stopColor="#152640" /></linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#pa-dusk)" />
      <circle cx="298" cy="58" r="9" fill="#FFE8B0" opacity=".9" />
      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={150 - b.h} width={b.w} height={b.h} fill={b.kind === "ppg" ? "#1E2C3E" : "#101820"} />
          {/* PPG Place: glass castle spires */}
          {b.kind === "ppg" && <g fill="#1E2C3E">{[0, 6, 12, 18].map(d => <polygon key={d} points={`${b.x + d},${150 - b.h} ${b.x + d + 4},${150 - b.h - 12} ${b.x + d + 8},${150 - b.h}`} />)}</g>}
          {/* Gulf Tower: stepped pyramid top with its weather beacon */}
          {b.kind === "gulf" && (
            <g fill="#101820">
              <rect x={b.x + 3} y={150 - b.h - 5} width={b.w - 6} height="5" />
              <rect x={b.x + 6} y={150 - b.h - 10} width={b.w - 12} height="5" />
              <rect x={b.x + 9} y={150 - b.h - 15} width={b.w - 18} height="5" />
              <rect x={b.x + b.w / 2 - 1.5} y={150 - b.h - 18} width="3" height="3" fill="#E5484D" />
            </g>
          )}
          {windows(b.x, 150 - b.h, b.w, b.h, i)}
          <text x={b.x + b.w / 2} y={roof(b) - 4} textAnchor="middle" fontSize="11" fontWeight="800" fontFamily="Arial, Helvetica, sans-serif" fill={GOLD}>{"PITTSBURGH"[i]}</text>
        </g>
      ))}
      <rect y="150" width="320" height="50" fill="url(#pa-river)" />
      {/* Three yellow bridges */}
      {[[18, 118], [128, 226], [236, 318]].map(([a, b], i) => (
        <g key={i} stroke={GOLD} fill="none" strokeWidth="2">
          <line x1={a} y1="160" x2={b} y2="160" strokeWidth="3" />
          <path d={`M${a},160 Q${(a + b) / 2},${128} ${b},160`} />
          {Array.from({ length: 7 }, (_, k) => { const x = a + ((b - a) * (k + 1)) / 8; const t = (x - a) / (b - a); const y = 160 - 4 * 32 * t * (1 - t); return <line key={k} x1={x} y1={y} x2={x} y2="160" strokeWidth="1" />; })}
          <line x1={a} y1="160" x2={a} y2="176" strokeWidth="3" /><line x1={b} y1="160" x2={b} y2="176" strokeWidth="3" />
        </g>
      ))}
      <g stroke={GOLD} strokeOpacity=".35" strokeWidth="1.2">{[70, 140, 200, 270].map(x => <line key={x} x1={x - 12} y1="186" x2={x + 12} y2="186" />)}</g>
    </svg>
  );
}

export function InclineArt() {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="pa-sky2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8EC5E8" /><stop offset="1" stopColor="#E9F4FA" /></linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#pa-sky2)" />
      <circle cx="60" cy="40" r="14" fill="#FFF3C4" />
      {/* Mount Washington */}
      <polygon points="0,40 70,52 140,78 210,122 320,160 320,200 0,200" fill="#3E6B48" />
      <polygon points="0,40 70,52 140,78 210,122 320,160 320,168 205,130 135,86 66,60 0,50" fill="#2F5438" />
      {/* Incline track and cars */}
      <line x1="42" y1="56" x2="262" y2="176" stroke="#5A4632" strokeWidth="5" />
      <line x1="42" y1="56" x2="262" y2="176" stroke="#8C6E4E" strokeWidth="1.5" strokeDasharray="3 3" />
      {[[108, 92], [196, 140]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(28.6)`}>
          <rect x="-16" y="-15" width="32" height="15" rx="2" fill="#B3262B" />
          <rect x="-12" y="-12" width="8" height="6" fill="#FFE8B0" /><rect x="-2" y="-12" width="8" height="6" fill="#FFE8B0" /><rect x="8" y="-12" width="5" height="6" fill="#FFE8B0" />
          <rect x="-17" y="-18" width="34" height="3" fill="#7A181C" />
        </g>
      ))}
      {/* Upper station */}
      <rect x="18" y="30" width="34" height="22" fill="#6E5A44" /><polygon points="14,31 35,18 56,31" fill="#4A3B2C" />
      {/* River and city below */}
      <rect y="176" width="320" height="24" fill="#2B5E8C" />
      {[[230, 150, 14, 26], [248, 136, 12, 40], [264, 146, 16, 30], [284, 128, 14, 48], [300, 142, 16, 34]].map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} fill="#1E2C3E" opacity=".85" />)}
    </svg>
  );
}

export function CathedralArt() {
  const floors = Array.from({ length: 14 }, (_, i) => i);
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="pa-sky3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F7D9A8" /><stop offset="1" stopColor="#FBEFDD" /></linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#pa-sky3)" />
      {/* Cathedral of Learning */}
      <g fill="#8A7A66">
        <rect x="136" y="44" width="48" height="140" />
        <rect x="142" y="26" width="36" height="20" /><rect x="148" y="12" width="24" height="16" /><rect x="154" y="4" width="12" height="10" />
        <rect x="112" y="120" width="96" height="64" />
      </g>
      <g stroke="#6F614F" strokeWidth="1.2">{[142, 150, 158, 166, 174, 180].map(x => <line key={x} x1={x} y1="30" x2={x} y2="184" />)}</g>
      <g fill="#F4E3B6" opacity=".8">{floors.map(f => <rect key={f} x="146" y={50 + f * 9} width="28" height="3" />)}</g>
      <path d="M150 184 v-22 a10 10 0 0 1 20 0 v22 z" fill="#5E5142" />
      {/* Lawn and trees */}
      <rect y="178" width="320" height="22" fill="#6E9B5A" />
      {[[40, 150, 26], [78, 160, 18], [248, 152, 24], [284, 162, 16]].map(([x, y, r], i) => <g key={i}><rect x={x - 2} y={y} width="4" height={180 - y} fill="#5B4632" /><circle cx={x} cy={y} r={r} fill="#4E7F46" /></g>)}
    </svg>
  );
}

export const ART = [
  { Art: SkylineArt, caption: "Downtown Pittsburgh and the yellow bridges" },
  { Art: InclineArt, caption: "Riding the Duquesne Incline up Mount Washington" },
  { Art: CathedralArt, caption: "The Cathedral of Learning in Oakland" },
];

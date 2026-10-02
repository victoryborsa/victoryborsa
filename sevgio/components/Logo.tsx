// The Sevgio badge: a house over a gold Pittsburgh bridge, with the river flowing underneath.
const NAVY = "#0B2A5B", GOLD = "#E3A60D";

export function Logo({ size = 48, animated = true, title = "Sevgio Stays: Yinz Are Home" }: { size?: number; animated?: boolean; title?: string }) {
  const hangers = [110, 122, 134, 162, 176, 190, 210, 224, 238, 266, 278, 290];
  const cable = (x: number) => {
    if (x < 148) return 268 - ((x - 85) / 63) * 36;
    if (x > 252) return 232 + ((x - 252) / 63) * 36;
    const t = (x - 148) / 104; return 232 + 4 * 36 * t * (1 - t);
  };
  const deck = (x: number) => { const t = (x - 85) / 230; return 298 - 4 * 34 * t * (1 - t); };
  const wave = (y: number) => `M-40 ${y} ` + Array.from({ length: 14 }, () => "q10 -5 20 0 t20 0").join(" ");
  return (
    <svg className={`sevgio-logo${animated ? " live" : ""}`} viewBox="0 0 400 400" width={size} height={size} role="img" aria-label={title}>
      <title>{title}</title>
      <defs>
        <clipPath id="logo-water"><path d="M70 300 Q200 262 330 300 L330 320 L70 320 z" /></clipPath>
      </defs>
      <circle cx="200" cy="200" r="192" fill="#fff" stroke={NAVY} strokeWidth="12" />
      <circle cx="200" cy="200" r="174" fill="none" stroke={GOLD} strokeWidth="4" />
      <text x="200" y="152" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="92" fill={NAVY} letterSpacing="-2">Sevgio</text>
      {/* House: roof, chimney, window */}
      <path d="M104 250 L200 182 L296 250" fill="none" stroke={NAVY} strokeWidth="20" strokeLinejoin="miter" />
      <rect x="248" y="190" width="18" height="34" fill={NAVY} />
      <rect x="186" y="210" width="28" height="28" fill={NAVY} />
      <path d="M200 212 V236 M188 224 H212" stroke="#fff" strokeWidth="3" />
      {/* Moving river under the bridge */}
      <g clipPath="url(#logo-water)">
        <rect x="70" y="270" width="260" height="60" fill="#DCEBFA" />
        <path className="logo-wave w1" d={wave(292)} fill="none" stroke="#2F6FB5" strokeWidth="4" strokeLinecap="round" />
        <path className="logo-wave w2" d={wave(304)} fill="none" stroke="#5E97D6" strokeWidth="4" strokeLinecap="round" />
        <path className="logo-wave w1" d={wave(314)} fill="none" stroke="#2F6FB5" strokeWidth="4" strokeLinecap="round" />
      </g>
      {/* Gold suspension bridge */}
      <g fill={GOLD} stroke={GOLD}>
        <path d="M85 296 Q200 226 315 296" fill="none" strokeWidth="20" />
        <rect x="80" y="262" width="12" height="38" stroke="none" /><rect x="308" y="262" width="12" height="38" stroke="none" />
        <rect x="143" y="226" width="11" height="54" stroke="none" /><rect x="246" y="226" width="11" height="54" stroke="none" />
        <path d="M86 268 L148 230 Q200 300 252 230 L314 268" fill="none" strokeWidth="7" />
        {hangers.map(x => <line key={x} x1={x} y1={cable(x)} x2={x} y2={deck(x) - 6} strokeWidth="4" />)}
      </g>
      <text x="200" y="360" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="33" fill={NAVY}>Yinz Are Home</text>
    </svg>
  );
}

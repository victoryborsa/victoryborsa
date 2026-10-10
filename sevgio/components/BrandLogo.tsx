/** The Sevgio house: teal house, darker teal roof line, white arched door and a coral heart. */
export function HouseMark({ size = 44, title }: { size?: number; title?: string }) {
  return (
    <svg className="house-mark" width={size} height={size * (220 / 260)} viewBox="0 0 260 220" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id="sv-house" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1AA6A0" />
          <stop offset="1" stopColor="#0B7A80" />
        </linearGradient>
      </defs>
      <path d="M130 34 L214 104 V184 a22 22 0 0 1 -22 22 H68 a22 22 0 0 1 -22 -22 V104 Z" fill="url(#sv-house)" />
      <path d="M24 108 L130 20 L236 108" fill="none" stroke="#0E7E83" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M108 206 V152 a22 22 0 0 1 44 0 V206 Z" fill="#FFFFFF" />
      <path d="M100 118 C 82 104 70 94 70 80 a15 15 0 0 1 30 -4 a15 15 0 0 1 30 4 c0 14 -12 24 -30 38 Z" fill="#F47C6C" />
    </svg>
  );
}

/** The full logo: house mark, "sevgio", and the "Stays • Homes • Experiences" line (hidden on small phones). */
export function BrandLogo({ size = 44, tagline = true }: { size?: number; tagline?: boolean }) {
  return (
    <span className="brand">
      <HouseMark size={size} />
      <span className="brand-text">
        <span className="brand-name">Sevgio</span>
        {tagline && <span className="brand-tag">Stays • Homes • Experiences</span>}
      </span>
    </span>
  );
}

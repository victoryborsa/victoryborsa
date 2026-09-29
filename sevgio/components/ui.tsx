import { BOOKING_STATUS } from "@/lib/constants.ts";

export function StatusPill({ status }: { status: string }) {
  const s = BOOKING_STATUS[status] || { label: status, tone: "neutral" };
  return <span className={`pill ${s.tone}`}>{s.label}</span>;
}

export function Star() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L10 15l-5.4 3 1.2-6L1.3 7.8l6.1-.7z" />
    </svg>
  );
}

export function Rating({ rating, count }: { rating: number | null; count: number }) {
  if (!rating) return <span className="pill neutral">New</span>;
  return (
    <span className="rating">
      <Star />
      {rating.toFixed(2)} <span className="muted" style={{ fontWeight: 400 }}>({count})</span>
    </span>
  );
}

export function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

import { reservationStatus } from "@/lib/statuses.ts";

/** Status pill for any reservation, from any source, with the reason underneath. */
export function ResPill({ s }: { s: Parameters<typeof reservationStatus>[0] }) {
  const st = reservationStatus(s);
  return <><span className={`pill ${st.tone}`}>{st.label}</span>{st.detail && <div className="hint">{st.detail}</div>}</>;
}
import { todayLocal, toInstant, type Instant } from "@/lib/dates.ts";

/** Reservation status pill (Confirmed, Pending, Checked In, …), with the reason underneath when there is one. */
export function StatusPill({ b, detail = true }: { b: { status: string; check_in: string; check_out: string }; detail?: boolean }) {
  const s = reservationStatus({ ...b, today: todayLocal() });
  return <><span className={`pill ${s.tone}`}>{s.label}</span>{detail && s.detail && <span className="hint"> {s.detail}</span>}</>;
}

export function Star() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L10 15l-5.4 3 1.2-6L1.3 7.8l6.1-.7z" />
    </svg>
  );
}

/** Listings show "New" for this many days after they were added, then nothing until they have reviews. */
export const NEW_BADGE_DAYS = 45;
export const isNewListing = (since: Instant, now = Date.now()) => { const d = toInstant(since); return !!d && now - d.getTime() < NEW_BADGE_DAYS * 86_400_000; };

export function Rating({ rating, count, since }: { rating: number | null; count: number; since?: Instant }) {
  if (!rating) return isNewListing(since ?? null) ? <span className="pill neutral">New</span> : null;
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

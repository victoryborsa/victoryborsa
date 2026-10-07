import Link from "next/link";
import { ArrowRight, CheckCircle, ClockCountdown, IdentificationCard, Question, Warning, WarningOctagon } from "@phosphor-icons/react/dist/ssr";
import { fmtDate, fmtShort, nightsBetween, fmtWhen } from "@/lib/dates.ts";
import { conflictSummary, conflictTitle, syncDelayNote, type ConflictRow, type FeedInfo, type StaySnap } from "@/lib/conflicts.ts";
import { hoursLabel } from "@/lib/conflict-core.ts";
import "./conflicts.css";

export type Base = "/host" | "/admin";

const STATUS_WORDS: Record<string, string> = { pending: "Request waiting for host", awaiting_payment: "Waiting for payment", confirmed: "Confirmed" };

/** Prominent dashboard notice while double bookings are unresolved. */
export function ConflictBanner({ base, active, cleared }: { base: Base; active: number; cleared: number }) {
  if (!active && !cleared) return null;
  return (
    <div className={`cf-banner${active ? "" : " calm"}`} role="status">
      <span className="cf-banner-ic">{active ? <WarningOctagon size={24} weight="fill" aria-hidden /> : <ClockCountdown size={24} weight="bold" aria-hidden />}</span>
      <div className="cf-banner-text">
        <b>{active ? `${active} double booking${active === 1 ? "" : "s"} need${active === 1 ? "s" : ""} your review` : `${cleared} conflict${cleared === 1 ? "" : "s"} no longer overlap${cleared === 1 ? "s" : ""}`}</b>
        <span>{active ? "Two reservations share the same nights. Nothing was cancelled." : "One of the reservations changed. Review and mark it resolved."}{active && cleared ? ` ${cleared} more no longer overlap.` : ""}</span>
      </div>
      <Link className="btn btn-primary btn-sm cf-banner-btn" href={`${base}/conflicts`}>Review {active + cleared === 1 ? "conflict" : "conflicts"} <ArrowRight size={16} weight="bold" aria-hidden /></Link>
    </div>
  );
}

/** Text + icon status, never color alone. */
export function ConflictStatus({ c }: { c: Pick<ConflictRow, "status" | "cleared_at" | "kind"> }) {
  if (c.status === "resolved") return <span className="cf-chip ok"><CheckCircle size={16} weight="bold" aria-hidden />Resolved</span>;
  if (c.cleared_at) return <span className="cf-chip amber"><ClockCountdown size={16} weight="bold" aria-hidden />No longer overlapping · review</span>;
  return <span className="cf-chip red"><Warning size={16} weight="fill" aria-hidden />{c.kind === "overlap" ? "Double booked" : "Turnover too short"}</span>;
}

/** Both stays on one date line, with the shared nights hatched (or the changeover marked). */
export function ConflictStrip({ c }: { c: Pick<ConflictRow, "kind" | "start_date" | "end_date" | "gap_hours" | "needed_hours" | "snapshot"> }) {
  const { a, b } = c.snapshot;
  const from = a.check_in < b.check_in ? a.check_in : b.check_in;
  const to = a.check_out > b.check_out ? a.check_out : b.check_out;
  const span = Math.max(1, nightsBetween(from, to));
  const pct = (d: string) => (nightsBetween(from, d) / span) * 100;
  const bar = (s: StaySnap) => ({ left: `${pct(s.check_in)}%`, width: `${Math.max(1.5, pct(s.check_out) - pct(s.check_in))}%` });
  const n = nightsBetween(c.start_date, c.end_date);
  const label = c.kind === "overlap" ? `${n} night${n === 1 ? "" : "s"} booked twice` : `${hoursLabel(Number(c.gap_hours))} turnover${Number(c.needed_hours) > 0 ? `, ${hoursLabel(Number(c.needed_hours))} needed` : ""}`;
  return (
    <figure className="cf-strip" aria-label={conflictSummary(c)}>
      <div className="cf-lanes">
        {c.kind === "overlap"
          ? <div className="cf-clash" style={{ left: `${pct(c.start_date)}%`, width: `${pct(c.end_date) - pct(c.start_date)}%` }} aria-hidden />
          : <div className="cf-gapmark" style={{ left: `${pct(c.start_date)}%` }} aria-hidden />}
        {[a, b].map((s, i) => (
          <div key={s.key} className="cf-lane">
            <div className={`cf-bar ch-${s.channel}`} style={bar(s)}>
              <span className="cf-bar-label"><i className={`cf-dot ch-${s.channel}`} aria-hidden />{i + 1}. {s.site}{s.ref ? ` · ${s.ref}` : ""}</span>
            </div>
          </div>
        ))}
      </div>
      <figcaption className="cf-axis">
        <span>{fmtShort(from)}</span>
        <b className="cf-axis-clash">{label}</b>
        <span>{fmtShort(to)}</span>
      </figcaption>
    </figure>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return <span className="cf-missing"><Question size={14} weight="bold" aria-hidden />{children}</span>;
}

/** One reservation in a conflict, with a link to its full record. */
export function StayPanel({ s, n, base, feed, gone }: { s: StaySnap; n: number; base: Base; feed?: FeedInfo | null; gone?: boolean }) {
  const href = s.booking_code ? (base === "/admin" ? `/admin/bookings/${s.booking_code}` : `/trips/${s.booking_code}`) : s.channel_id ? `/host/bookings/other-sites/${s.channel_id}` : null;
  const nights = nightsBetween(s.check_in, s.check_out);
  return (
    <section className="cf-stay" aria-labelledby={`stay-${s.key}`}>
      <header className="cf-stay-head">
        <span className="cf-num" aria-hidden>{n}</span>
        <div>
          <h3 id={`stay-${s.key}`} className="cf-stay-site"><i className={`cf-dot ch-${s.channel}`} aria-hidden />{s.site}</h3>
          <p className="cf-stay-place">{s.place}{s.whole_home && <span className="cf-tag">Whole house</span>}</p>
        </div>
      </header>
      <dl className="cf-facts">
        <div><dt>Reference</dt><dd className="mono">{s.ref || <Missing>Reference not sent by {s.site}</Missing>}</dd></div>
        <div><dt>Guest</dt><dd>{s.guest || <Missing>Name not sent by {s.site}</Missing>}</dd></div>
        <div><dt>Dates</dt><dd>{fmtDate(s.check_in)} → {fmtDate(s.check_out)}<span className="hint"> · {nights} night{nights === 1 ? "" : "s"}</span></dd></div>
        <div><dt>Booking</dt><dd>{gone ? <span className="cf-chip amber"><ClockCountdown size={14} weight="bold" aria-hidden />No longer active</span>
          : s.channel === "sevgio" ? (STATUS_WORDS[s.status] || s.status) : `Reservation on ${s.site}`}</dd></div>
      </dl>
      {s.channel !== "sevgio" && <p className="cf-sync"><ClockCountdown size={16} weight="bold" aria-hidden /><span>{syncDelayNote(s.site, feed ?? null)}</span></p>}
      {href && <Link className="btn btn-ghost btn-sm cf-open" href={href}><IdentificationCard size={16} weight="bold" aria-hidden />Open reservation {n}</Link>}
    </section>
  );
}

/** A conflict in the list: what clashes, both stays on a date line, and the button to review it. */
export function ConflictCard({ c, base }: { c: ConflictRow; base: Base }) {
  const { a, b } = c.snapshot;
  return (
    <article className={`cf-card${c.status === "resolved" ? " done" : c.cleared_at ? " calm" : ""}`} data-conflict={c.id}>
      <div className="cf-card-top">
        <ConflictStatus c={c} />
        <span className="hint">Found {fmtWhen(c.first_detected_at, "short")}</span>
      </div>
      <h3 className="cf-card-title">{conflictTitle(c)}</h3>
      <p className="cf-card-sum">{conflictSummary(c)}</p>
      <ConflictStrip c={c} />
      <ul className="cf-pair">
        {[a, b].map((s, i) => (
          <li key={s.key}><span className="cf-num sm" aria-hidden>{i + 1}</span><i className={`cf-dot ch-${s.channel}`} aria-hidden /><b>{s.site}</b>
            <span className="mono">{s.ref || <Missing>No reference</Missing>}</span><span>{s.guest || <Missing>Name not sent by {s.site}</Missing>}</span>
            <span className="hint">{fmtShort(s.check_in)} - {fmtShort(s.check_out)}</span></li>
        ))}
      </ul>
      {c.status === "resolved" && <p className="hint">Resolved{c.resolved_by_name ? ` by ${c.resolved_by_name}` : ""}{c.resolution_note ? `: ${c.resolution_note}` : ""}</p>}
      <div className="row"><Link className="btn btn-primary" href={`${base}/conflicts/${c.id}`}>Review conflict <ArrowRight size={16} weight="bold" aria-hidden /></Link></div>
    </article>
  );
}

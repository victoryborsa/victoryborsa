import Link from "next/link";
import { notFound } from "next/navigation";
import { ColorIcon } from "./Icon.tsx";
import type { User } from "@/lib/auth.ts";
import { checkConflicts, conflictSummary, conflictTitle, feedStatus, feedsById, getConflict, listConflicts, openConflictCounts, stillActive, turnoverSettings } from "@/lib/conflicts.ts";
import { RESOLUTIONS, hoursLabel } from "@/lib/conflict-core.ts";
import { emailReady } from "@/lib/email.ts";
import { pushKeys } from "@/lib/push.ts";
import { ActionForm, SubmitButton } from "./forms.tsx";
import { PushToggle } from "./PushToggle.tsx";
import { ConflictCard, ConflictStatus, ConflictStrip, StayPanel, type Base } from "./Conflicts.tsx";
import { checkConflictsNowAction, reopenConflictAction, resolveConflictAction, setTurnaroundAction } from "@/app/actions/conflicts.ts";
import { fmtWhen, type Instant } from "@/lib/dates.ts";

const when = (t: Instant) => fmtWhen(t, "short");
const TURNOVER = [0, 1, 2, 3, 4, 5, 6, 8, 12, 24, 48];

/** Double bookings: the list (Needs review / Resolved), how alerts reach you, calendar freshness and turnover times. */
export async function ConflictsList({ u, base, tab }: { u: User; base: Base; tab?: string }) {
  await checkConflicts();
  const which = tab === "resolved" ? "resolved" : "open";
  const [rows, counts, feeds, turnover, keys] = await Promise.all([listConflicts(u, which), openConflictCounts(u), feedStatus(u), turnoverSettings(u), pushKeys()]);
  const open = counts.active + counts.cleared;
  return (
    <div className="cf-page">
      <div className="cf-head">
        <div>
          <h2>Double bookings</h2>
          <p className="muted">Every home and room is checked against direct bookings and Airbnb, Booking.com, Vrbo and other connected sites, including whole-house bookings against the rooms inside. Nothing is cancelled automatically.</p>
        </div>
        <ActionForm action={checkConflictsNowAction} className="cf-check">
          <SubmitButton className="btn btn-ghost btn-sm" pendingText="Checking…">Check now</SubmitButton>
        </ActionForm>
      </div>
      <div className="cf-tabs" role="tablist" aria-label="Conflicts">
        <Link role="tab" aria-selected={which === "open"} href={`${base}/conflicts`}><ColorIcon file="warn" size={18} />Needs review{open ? <span className="cf-count">{open}</span> : null}</Link>
        <Link role="tab" aria-selected={which === "resolved"} href={`${base}/conflicts?tab=resolved`}><ColorIcon file="check" size={18} />Resolved</Link>
      </div>
      <div className="cf-grid">
        <div className="cf-list">
          {rows.length ? rows.map(c => <ConflictCard key={c.id} c={c} base={base} />) : (
            <div className="cf-empty">
              <ColorIcon file="check" size={32} />
              <b>{which === "open" ? "No double bookings" : "Nothing resolved yet"}</b>
              <p className="muted">{which === "open" ? "Sevgio checks again after every calendar refresh and every new or changed reservation." : "Conflicts you mark as resolved are kept here."}</p>
            </div>
          )}
        </div>
        <aside className="cf-side">
          <section className="cf-box">
            <h3><ColorIcon file="bell" size={18} />How you&apos;re alerted</h3>
            <ul className="cf-alerts">
              <li><ColorIcon file="envelope" size={18} /><span><b>Email</b> to every admin and the listing&apos;s host{emailReady() ? "." : <><br /><span className="cf-warn-text">Email isn&apos;t set up on the server yet (SMTP settings), so emails can&apos;t go out.</span></>}</span></li>
              <li><ColorIcon file="warn" size={18} /><span><b>Dashboard notice</b> at the top of every host and admin page until each conflict is resolved.</span></li>
            </ul>
            <PushToggle publicKey={keys.publicKey} />
          </section>
          <section className="cf-box">
            <h3><ColorIcon file="calcheck" size={18} />Calendar links</h3>
            <p className="hint">Other sites update their calendar links on their own schedule, and Sevgio reads each link every hour, so a reservation made there can reach Sevgio a few hours later.</p>
            {feeds.length ? (
              <ul className="cf-feeds">
                {feeds.map(f => (
                  <li key={f.id}><span><b>{f.name}</b><span className="hint">{f.place}</span></span>
                    <span className={f.last_error ? "cf-feed-bad" : "cf-feed-ok"}>{f.last_synced_at ? `Last successful check ${when(f.last_synced_at)}` : "Not read yet"}{f.last_error ? ` · ${f.last_error}` : ""}</span></li>
                ))}
              </ul>
            ) : <p className="hint">No calendar links yet. Add them in Listings › Calendar.</p>}
          </section>
          <section className="cf-box" id="turnover">
            <h3><ColorIcon file="dashboard" size={18} />Turnover time</h3>
            <p className="hint">Extra time needed between check-out and the next check-in. With 0, a same-day changeover is fine as long as check-in is after check-out.</p>
            <ul className="cf-turn">
              {turnover.map(t => (
                <li key={t.id}>
                  <ActionForm action={setTurnaroundAction} className="cf-turn-form">
                    <input type="hidden" name="property" value={t.id} />
                    <label htmlFor={`tt-${t.id}`}><b>{t.parent_title ? `${t.parent_title} › ${t.title}` : t.title}</b><span className="hint">Out {t.check_out_time} · in {t.check_in_time}</span></label>
                    <select id={`tt-${t.id}`} name="hours" className="input" defaultValue={String(t.turnaround_hours)}>
                      {[...new Set([...TURNOVER, t.turnaround_hours])].sort((x, y) => x - y).map(h => <option key={h} value={h}>{h ? hoursLabel(h) : "No extra time"}</option>)}
                    </select>
                    <SubmitButton className="btn btn-ghost btn-sm" pendingText="Saving…">Save</SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** One conflict: both reservations side by side, the dates on one line, alert history, and Resolve. */
export async function ConflictReview({ u, base, id }: { u: User; base: Base; id: string }) {
  const c = await getConflict(u, id);
  if (!c) notFound();
  const { a, b } = c.snapshot;
  const [feeds, aLive, bLive] = await Promise.all([feedsById([a.feed_id, b.feed_id]), stillActive(a), stillActive(b)]);
  return (
    <div className="cf-page">
      <p><Link href={`${base}/conflicts`}>‹ All conflicts</Link></p>
      <div className="cf-review-head">
        <ConflictStatus c={c} />
        <h2>{conflictTitle(c)}</h2>
        <p className="cf-lede">{conflictSummary(c)}</p>
        {c.cleared_at && c.status === "open" && <p className="notice warn">Since {when(c.cleared_at)} these reservations no longer clash{!aLive || !bLive ? ` (reservation ${!aLive ? 1 : 2} is no longer active)` : ""}. Check that this is what you expected, then mark it resolved.</p>}
      </div>
      <ConflictStrip c={c} />
      <div className="cf-stays">
        <StayPanel s={a} n={1} base={base} feed={a.feed_id ? feeds.get(a.feed_id) : null} gone={!aLive} />
        <StayPanel s={b} n={2} base={base} feed={b.feed_id ? feeds.get(b.feed_id) : null} gone={!bLive} />
      </div>
      <div className="cf-grid cf-grid-review">
        <section className="cf-box">
          {c.status === "open" ? (
            <>
              <h3>Resolve this conflict</h3>
              <p className="hint">Sort it out with the guests and on the booking site first (move one guest, or cancel one reservation where it was made). Sevgio never cancels either reservation for you.</p>
              <ActionForm action={resolveConflictAction} className="stack cf-resolve">
                <input type="hidden" name="id" value={c.id} />
                <fieldset>
                  <legend>What happened?</legend>
                  {RESOLUTIONS.map(([k, label]) => (
                    <label key={k} className="cf-radio"><input type="radio" name="resolution" value={k} required />{label}</label>
                  ))}
                </fieldset>
                <label className="field"><span>Note (optional)</span><textarea className="input" name="note" rows={2} maxLength={1000} placeholder="e.g. Guest moved to the Room 3 listing" /></label>
                <SubmitButton pendingText="Saving…">Mark as resolved</SubmitButton>
              </ActionForm>
            </>
          ) : (
            <>
              <h3>Resolved</h3>
              <p>{RESOLUTIONS.find(r => r[0] === c.resolution)?.[1] || "Resolved"}{c.resolution_note ? `: ${c.resolution_note}` : ""}</p>
              <p className="hint">{c.resolved_by_name ? `${c.resolved_by_name}, ` : ""}{c.resolved_at ? when(c.resolved_at) : ""}. Both reservations were left unchanged.</p>
              <form action={reopenConflictAction}><input type="hidden" name="id" value={c.id} /><button className="btn btn-ghost btn-sm">Reopen</button></form>
            </>
          )}
        </section>
        <section className="cf-box">
          <h3>Alert history</h3>
          <dl className="cf-facts">
            <div><dt>Found</dt><dd>{when(c.first_detected_at)}</dd></div>
            <div><dt>Last seen</dt><dd>{when(c.last_detected_at)}</dd></div>
            <div><dt>Email</dt><dd>{c.notified_at ? `${c.email_result || "Sent"} · ${when(c.notified_at)}` : "Sending…"}</dd></div>
            <div><dt>Phone alerts</dt><dd>{c.push_result || (c.notified_at ? "-" : "Sending…")}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}

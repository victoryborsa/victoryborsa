import Link from "next/link";
import type { User } from "@/lib/auth.ts";
import { nextScheduledSync, syncHealth, type FeedHealth } from "@/lib/sync-health.ts";
import { syncNowAction } from "@/app/actions/sync.ts";
import { ALERT_AFTER_FAILS } from "@/lib/calendar-sync.ts";
import { Badge } from "./Badge.tsx";

const when = (t: string | Date) => new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

const STATE: Record<FeedHealth["state"], [tone: "ok" | "warn" | "danger" | "neutral", icon: "check" | "warn" | "cross" | "wait", label: string]> = {
  ok: ["ok", "check", "Working"], warning: ["warn", "warn", "Working, with a warning"], failing: ["danger", "cross", "Failing"], never: ["neutral", "wait", "Not synced yet"],
};

/** Every calendar link with its last successful sync, the next scheduled one, what the last sync changed, and errors. */
export async function CalendarSync({ u, base, synced, failed }: { u: User; base: "/host" | "/admin"; synced?: string; failed?: string }) {
  const [feeds, next] = await Promise.all([syncHealth(u), nextScheduledSync()]);
  const failing = feeds.filter(f => f.state === "failing").length;
  const back = `${base}/calendar-sync`;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Calendar sync</h2>
          <p className="hint" style={{ margin: "4px 0 0" }}>
            Airbnb, Booking.com and Vrbo calendar links are read every hour{next ? `; next run about ${when(next)}` : ""}. A link that fails is tried again right away and at every
            run after; other links keep syncing. Admins get an email after {ALERT_AFTER_FAILS} failures in a row.
          </p>
        </div>
        {feeds.length > 0 && (
          <form action={syncNowAction}><input type="hidden" name="feed" value="all" /><input type="hidden" name="back" value={back} />
            <button className="btn btn-primary">Sync all now</button></form>
        )}
      </div>
      {synced && <div className={`notice ${failed && failed !== "0" ? "warn" : "ok"}`} role="status">Synced {synced} calendar link{synced === "1" ? "" : "s"}{failed && failed !== "0" ? `; ${failed} failed (see below)` : ", all working"}.</div>}
      {failing > 0 && !synced && <div className="notice warn" role="status">{failing} calendar link{failing === 1 ? " is" : "s are"} failing, so new bookings and cancellations from {failing === 1 ? "that site" : "those sites"} aren&apos;t reaching Sevgio.</div>}
      {feeds.length === 0 ? <p className="muted">No calendar links yet. Add them on each listing&apos;s Calendar page.</p> : (
        <div className="tbl-wrap">
          <table className="tbl bk-tbl sy-tbl" aria-label="Calendar links">
            <thead><tr><th>Calendar</th><th>Status</th><th>Last successful sync</th><th>Last sync found</th><th>Errors</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{feeds.map(f => {
              const [tone, icon, label] = STATE[f.state], r = f.last_result;
              return (
                <tr key={f.id} data-feed={f.id} data-state={f.state}>
                  <td data-label="Calendar"><b>{f.site}</b><div className="hint">{f.place}</div></td>
                  <td data-label="Status"><Badge tone={tone} icon={icon}>{label}</Badge></td>
                  <td data-label="Last successful sync">{f.last_synced_at ? when(f.last_synced_at) : "Never"}{f.last_attempt_at && f.last_attempt_at !== f.last_synced_at && <div className="hint">Last tried {when(f.last_attempt_at)}</div>}</td>
                  <td data-label="Last sync found">{f.last_synced_at && r.events != null
                    ? <>{r.events} stay{r.events === 1 ? "" : "s"} and closed periods<div className="hint">{r.added ?? 0} new · {(r.updated ?? 0) + (r.changed ?? 0)} updated · {r.cancelled ?? 0} cancelled</div></>
                    : <span className="muted">–</span>}</td>
                  <td data-label="Errors">{f.fail_count > 0 ? <><b>{f.fail_count} failed tr{f.fail_count === 1 ? "y" : "ies"} in a row</b><div className="hint">{f.last_error}</div>{f.alerted_at && <div className="hint">Admins emailed {when(f.alerted_at)}</div>}</>
                    : f.last_error ? <span className="hint">{f.last_error}</span> : <span className="muted">None</span>}</td>
                  <td data-label="">
                    <form action={syncNowAction}><input type="hidden" name="feed" value={f.id} /><input type="hidden" name="back" value={back} /><button className="btn btn-ghost btn-sm">Sync now</button></form>
                    <Link className="hint" href={`/host/listings/${f.property_id}/calendar`}>Edit link</Link>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

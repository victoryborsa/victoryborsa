import Link from "next/link";
import { setStageAction } from "@/app/actions/admin.ts";
import { fmtWhen } from "@/lib/dates.ts";
import { STAGE_LABEL, nextStages, type Stage } from "@/lib/stages.ts";
import { channelLabel, isChannel } from "@/lib/channels.ts";

export type Ev = { id: number; at: string; level: string; area: string; message: string; details: Record<string, unknown>; resolved_at: string | null; email: string | null;
  stage: Stage; stage_at: string | null; stage_note: string; stage_by_email?: string | null; seen?: number; booking_code?: string | null; property_title?: string | null };

const STAGE_TONE: Record<Stage, string> = { new: "danger", investigating: "warn", fix_deployed: "info", verified: "ok", resolved: "neutral" };
const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** The Operations log: when, where, what, the route and release it happened on, what it relates to, and where fixing it stands. */
export function EventTable({ rows }: { rows: Ev[] }) {
  if (!rows.length) return <div className="empty"><p className="muted">Nothing logged.</p></div>;
  const tone: Record<string, string> = { error: "danger", warn: "warn", info: "neutral" };
  return (
    <div className="tbl-wrap">
      <table className="tbl ops-tbl">
        <thead><tr><th>Time (ET)</th><th>Area</th><th>Message</th><th>Route / API</th><th>Related</th><th>Stage</th></tr></thead>
        <tbody>
          {rows.map(e => {
            const d = e.details || {};
            const route = text(d.route) || text(d.path);
            const platform = text(d.platform) || text(d.channel);
            const { stack, route: _r, path: _p, version, ...rest } = d;
            return (
              <tr key={e.id} data-stage={e.stage}>
                <td data-label="Time" className="mono" style={{ whiteSpace: "nowrap" }}>{fmtWhen(e.at, "short")}<div className="hint">Version {text(version) || "unknown"}</div></td>
                <td data-label="Area"><span className={`pill ${tone[e.level]}`}>{e.level === "warn" ? "Warning" : e.level === "error" ? "Error" : "Info"}</span><div>{e.area}</div></td>
                <td data-label="Message" style={{ minWidth: 220 }}>
                  {e.message}
                  {(e.seen ?? 1) > 1 && <div className="hint">Happened {e.seen} times</div>}
                  {stack ? <details><summary className="hint" style={{ cursor: "pointer" }}>Stack trace</summary><pre className="mono ops-pre">{text(stack)}</pre></details> : null}
                  {Object.keys(rest).length > 0 && <details><summary className="hint" style={{ cursor: "pointer" }}>Details</summary><pre className="mono ops-pre">{JSON.stringify(rest, null, 2)}</pre></details>}
                </td>
                <td data-label="Route / API" className="mono" style={{ fontSize: 12 }}>{route || <span className="muted">–</span>}</td>
                <td data-label="Related" style={{ fontSize: 13 }}>
                  {e.booking_code ? <div>Reservation <Link className="mono" href={`/admin/bookings/${e.booking_code}`}>{e.booking_code}</Link></div> : text(d.booking) ? <div className="mono">{text(d.booking)}</div> : null}
                  {e.property_title && <div>{e.property_title}</div>}
                  {platform && <div className="hint">{isChannel(platform) ? channelLabel(platform) : platform}</div>}
                  {!e.booking_code && !text(d.booking) && !e.property_title && !platform && <span className="muted">–</span>}
                  {e.email && <div className="hint">By {e.email}</div>}
                </td>
                <td data-label="Stage" style={{ minWidth: 170 }}>
                  {e.level === "info" ? <span className="muted">–</span> : (
                    <>
                      <span className={`pill ${STAGE_TONE[e.stage] || "neutral"}`}>{STAGE_LABEL[e.stage] || e.stage}</span>
                      {e.stage_at && <div className="hint">{fmtWhen(e.stage_at, "short")}{e.stage_by_email ? ` · ${e.stage_by_email}` : ""}</div>}
                      {e.stage_note && <div className="hint">“{e.stage_note}”</div>}
                      {/* One small form per step, so the chosen step is always sent (a button's own value can be dropped before the page finishes loading). */}
                      {nextStages(e.stage).map((s, i) => (
                        <form key={s} action={setStageAction} className="ops-stage">
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="stage" value={s} />
                          {i === 0 && <input className="input" name="note" placeholder="Note (optional)" aria-label="Note" />}
                          <button className="btn btn-ghost btn-sm">{s === "investigating" && e.stage !== "new" ? "Reopen" : `Move to ${STAGE_LABEL[s]}`}</button>
                        </form>
                      ))}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

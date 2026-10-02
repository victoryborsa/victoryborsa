import { resolveEventAction } from "@/app/actions/admin.ts";

export type Ev = { id: number; at: string; level: string; area: string; message: string; details: Record<string, unknown>; resolved_at: string | null; email: string | null };

export function EventTable({ rows }: { rows: Ev[] }) {
  if (!rows.length) return <div className="empty"><p className="muted">Nothing logged.</p></div>;
  const tone: Record<string, string> = { error: "danger", warn: "warn", info: "neutral" };
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>When (ET)</th><th>Level</th><th>Area</th><th>What happened</th><th>By</th><th /></tr></thead>
        <tbody>
          {rows.map(e => (
            <tr key={e.id}>
              <td className="mono" style={{ whiteSpace: "nowrap" }}>{new Date(e.at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
              <td><span className={`pill ${tone[e.level]}`}>{e.level === "warn" ? "Warning" : e.level === "error" ? "Error" : "Info"}</span></td>
              <td>{e.area}</td>
              <td>
                {e.message}
                {Object.keys(e.details || {}).length > 0 && (
                  <details><summary className="hint" style={{ cursor: "pointer" }}>Details</summary><pre className="mono" style={{ fontSize: 12, whiteSpace: "pre-wrap", maxWidth: 520 }}>{JSON.stringify(e.details, null, 2)}</pre></details>
                )}
              </td>
              <td className="hint">{e.email || "-"}</td>
              <td>
                {e.level !== "info" && (
                  <form action={resolveEventAction}>
                    <input type="hidden" name="id" value={e.id} /><input type="hidden" name="resolved" value={e.resolved_at ? "0" : "1"} />
                    <button className="btn btn-ghost btn-sm">{e.resolved_at ? "Reopen" : "Mark resolved"}</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";
import { useActionState } from "react";
import { importPayoutAction, type ImportState } from "@/app/actions/channel.ts";
import { FIELDS } from "@/lib/payout-import.ts";

const usd = (c: number | null) => (c == null ? "–" : (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }));

/** Two steps: pick a file and see what would change (nothing is saved), then import. */
export function PayoutImport({ listings, channels }: { listings: { id: string; name: string }[]; channels: [string, string][] }) {
  const [s, action, pending] = useActionState<ImportState, FormData>(importPayoutAction, null);
  const preview = s?.step === "preview";
  return (
    <div className="stack" style={{ gap: 16 }}>
      <form action={action} className="box stack" aria-label="Payout file">
        <div className="grid-2">
          <label className="field"><span>Payout or earnings file (CSV)</span><input className="input" type="file" name="file" accept=".csv,.txt,text/csv" /></label>
          <label className="field"><span>Which site is it from?</span>
            <select className="input" name="channel" defaultValue={s?.opts?.channel || "airbnb"}>{channels.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="field"><span>Listing for lines that match no reservation</span>
            <select className="input" name="default_property" defaultValue={s?.opts?.defaultProperty || ""}><option value="">Skip them</option>{listings.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </label>
          <label className="chk fin-chk"><input type="checkbox" name="mark_received" defaultChecked={!!s?.opts?.markReceived} /> These payouts have already reached my bank account</label>
        </div>
        {preview && s.headers && (
          <>
            <input type="hidden" name="text" value={s.text} />
            <input type="hidden" name="file_name" value={s.fileName} />
            <fieldset className="stack">
              <legend>Columns in {s.fileName}. Check each match, then import.</legend>
              <div className="imp-map">
                {FIELDS.map(([f, label]) => (
                  <label key={f} className="field"><span>{label}</span>
                    <select className="input" name={"map_" + f} defaultValue={s.mapping?.[f] ?? ""}>
                      <option value="">(not in file)</option>
                      {s.headers!.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}
        {s?.error && <p className="err-text" role="alert">{s.error}</p>}
        <div className="row">
          <button className="btn btn-ghost" name="mode" value="preview" disabled={pending}>{pending ? "Reading…" : preview ? "Check again" : "Check file"}</button>
          {preview && s.summary && <button className="btn btn-primary" name="mode" value="apply" disabled={pending}>Import {s.summary.updated + s.summary.created} reservation{s.summary.updated + s.summary.created === 1 ? "" : "s"}</button>}
        </div>
      </form>

      {s?.ok && <div className="notice ok" role="status">{s.ok}</div>}
      {s?.summary && (
        <div className="stack">
          <h3>{preview ? "What will happen (nothing saved yet)" : "What happened"}</h3>
          <p>{s.summary.updated} matched to existing reservations · {s.summary.created} new · {s.summary.skipped} skipped{s.skippedLines?.length ? ` · ${s.skippedLines.length} lines that aren't reservations ignored` : ""}</p>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Code</th><th>Dates</th><th>Listing</th><th className="num">Payout</th><th>Result</th></tr></thead>
              <tbody>
                {s.summary.outcomes.map(o => (
                  <tr key={o.key}>
                    <td className="mono">{o.ref || "–"}</td><td>{o.check_in || "?"} → {o.check_out || "?"}</td><td>{o.place || "–"}</td><td className="num">{usd(o.payout)}</td>
                    <td>{o.action === "update" ? <span className="pill ok">Update</span> : o.action === "create" ? <span className="pill neutral">Add new</span> : <><span className="pill warn">Skip</span> <span className="hint">{o.reason}</span></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

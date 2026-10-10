import { requireUser } from "@/lib/auth.ts";
import Link from "next/link";
import { EventTable } from "@/components/EventTable.tsx";
import { opsEvents, outbox } from "@/lib/ops.ts";
import { retryEmailAction } from "@/app/actions/admin.ts";
import { fmtWhen } from "@/lib/dates.ts";
import { deployVersion } from "@/lib/log.ts";

export default async function Log({ searchParams }: { searchParams: Promise<{ level?: string; open?: string }> }) {
  await requireUser(["admin"], "/admin");
  const sp = await searchParams;
  const level = ["error", "warn", "info"].includes(sp.level || "") ? sp.level! : "";
  // Open errors are shown by default; resolved ones stay in the log and can be shown again.
  const openOnly = sp.open !== "0";
  const [rows, mail] = await Promise.all([
    opsEvents("($1 = '' OR e.level = $1) AND (NOT $2 OR e.level = 'info' OR e.stage <> 'resolved')", [level, openOnly]),
    outbox(),
  ]);
  const href = (l: string, open = openOnly) => `/admin/log?level=${l}${open ? "" : "&open=0"}`;
  const link = (l: string, label: string) => <Link className="btn btn-sm" href={href(l)} style={l === level ? { background: "var(--ink)", color: "var(--bg)" } : { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)" }}>{label}</Link>;
  const waiting = mail.filter(m => m.status !== "sent");
  return (
    <>
      <p className="muted" style={{ marginBottom: 12 }}>Every failed booking, email or calendar sync, server error, and sensitive change (roles, prices, settings) is recorded here. Errors move from New to Investigating, Fix Deployed, Verified and Resolved; they can only be resolved after the fix is verified. Passwords, card details, secrets and door codes are never stored. This release: <span className="mono">{deployVersion()}</span>.</p>
      <div className="row" style={{ marginBottom: 16 }}>
        {link("", "Everything")}{link("error", "Errors")}{link("warn", "Warnings")}{link("info", "Activity")}
        <span className="spacer" />
        <Link href={href(level, !openOnly)}>{openOnly ? "Show resolved too" : "Hide resolved"}</Link>
      </div>
      <EventTable rows={rows} />
      <h3 style={{ marginTop: 28 }}>Email outbox</h3>
      <p className="muted">Emails that couldn&apos;t be sent wait here and are tried again automatically after 10 minutes, 30 minutes, 2 hours, 6 hours and 24 hours.</p>
      {mail.length === 0 ? <p className="muted">No emails waiting. Everything recent went out on the first try.</p> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Queued (ET)</th><th>To</th><th>Subject</th><th>Status</th><th>Last error</th><th /></tr></thead>
            <tbody>{mail.map(m => (
              <tr key={m.id}>
                <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtWhen(m.created_at, "short")}</td>
                <td>{m.to_addr}</td>
                <td>{m.subject.replace(/\d{6}/g, "######")}</td>
                <td>{m.status === "sent" ? <span className="pill ok">Sent {fmtWhen(m.sent_at, "short")}</span> : m.status === "failed" ? <span className="pill danger">Failed after {m.attempts} tries</span> : <span className="pill warn">Waiting · next try {fmtWhen(m.next_try_at, "short")}</span>}</td>
                <td className="hint" style={{ maxWidth: 280 }}>{m.status === "sent" ? "" : m.last_error}</td>
                <td>{m.status !== "sent" && <form action={retryEmailAction}><input type="hidden" name="id" value={m.id} /><button className="btn btn-ghost btn-sm">{m.status === "failed" ? "Resend" : "Retry now"}</button></form>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {waiting.length > 1 && <form action={retryEmailAction} style={{ marginTop: 8 }}><button className="btn btn-ghost btn-sm">Retry all waiting emails now</button></form>}
    </>
  );
}

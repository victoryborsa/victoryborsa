import { requireUser } from "@/lib/auth.ts";
import Link from "next/link";
import { q } from "@/lib/db.ts";
import { EventTable, type Ev } from "@/components/EventTable.tsx";

export default async function Log({ searchParams }: { searchParams: Promise<{ level?: string; open?: string }> }) {
  await requireUser(["admin"], "/admin");
  const sp = await searchParams;
  const level = ["error", "warn", "info"].includes(sp.level || "") ? sp.level! : "";
  const openOnly = sp.open === "1";
  const rows = await q<Ev>(
    `SELECT e.*, u.email FROM event_log e LEFT JOIN users u ON u.id = e.user_id
     WHERE ($1 = '' OR e.level = $1) AND (NOT $2 OR e.resolved_at IS NULL) ORDER BY e.at DESC LIMIT 400`,
    [level, openOnly],
  );
  const link = (l: string, label: string) => <Link className="btn btn-sm" href={`/admin/log?level=${l}${openOnly ? "&open=1" : ""}`} style={l === level ? { background: "var(--ink)", color: "var(--bg)" } : { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)" }}>{label}</Link>;
  return (
    <>
      <p className="muted" style={{ marginBottom: 12 }}>Every failed booking, email or calendar sync, server error, and sensitive change (roles, prices, settings) is recorded here.</p>
      <div className="row" style={{ marginBottom: 16 }}>
        {link("", "Everything")}{link("error", "Errors")}{link("warn", "Warnings")}{link("info", "Activity")}
        <span className="spacer" />
        <Link href={`/admin/log?level=${level}${openOnly ? "" : "&open=1"}`}>{openOnly ? "Show resolved too" : "Hide resolved"}</Link>
      </div>
      <EventTable rows={rows} />
    </>
  );
}

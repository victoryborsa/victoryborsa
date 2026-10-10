import { markMessageAction } from "@/app/actions/host.ts";
import { fmtWhen } from "@/lib/dates.ts";

export type Msg = { id: string; name: string; email: string; topic: string; body: string; handled: boolean; created_at: string; title: string | null };

export function MessageList({ rows }: { rows: Msg[] }) {
  if (!rows.length) return <div className="empty"><p className="muted">No messages.</p></div>;
  return (
    <div className="stack">
      {rows.map(m => (
        <div key={m.id} className="box" style={{ padding: 16, opacity: m.handled ? 0.7 : 1 }}>
          <div className="row">
            <strong style={{ flex: 1 }}>{m.topic || "Message"}{m.title ? "" : ""}</strong>
            <span className="hint">{fmtWhen(m.created_at)}</span>
            {m.handled ? <span className="pill neutral">Answered</span> : <span className="pill warn">New</span>}
          </div>
          <p className="prose">{m.body}</p>
          <div className="row">
            <span style={{ flex: 1 }}>From <b>{m.name}</b> · <a href={`mailto:${m.email}?subject=${encodeURIComponent("Re: " + (m.topic || "your message"))}`}>{m.email}</a></span>
            <form action={markMessageAction}>
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="handled" value={m.handled ? "0" : "1"} />
              <button className="btn btn-ghost btn-sm">{m.handled ? "Mark as new" : "Mark as answered"}</button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}

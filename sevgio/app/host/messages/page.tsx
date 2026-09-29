import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { scopeSql } from "@/lib/access.ts";
import { MessageList, type Msg } from "@/components/MessageList.tsx";

export default async function HostMessages() {
  const u = await requireUser(["host", "admin"], "/host/messages");
  const s = scopeSql(u);
  const rows = await q<Msg>(`SELECT m.*, p.title FROM messages m JOIN properties p ON p.id = m.property_id WHERE ${s.sql} ORDER BY m.handled, m.created_at DESC LIMIT 200`, s.params);
  return (
    <>
      <p className="muted" style={{ marginBottom: 16 }}>Questions guests sent from your listing pages. Reply by email, then mark them as answered.</p>
      <MessageList rows={rows} />
    </>
  );
}

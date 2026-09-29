import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { MessageList, type Msg } from "@/components/MessageList.tsx";

export default async function AdminMessages() {
  await requireUser(["admin"], "/admin");
  const rows = await q<Msg>("SELECT m.*, p.title FROM messages m LEFT JOIN properties p ON p.id = m.property_id ORDER BY m.handled, m.created_at DESC LIMIT 300");
  return (
    <>
      <p className="muted" style={{ marginBottom: 16 }}>Contact form messages and guest questions about every listing.</p>
      <MessageList rows={rows} />
    </>
  );
}

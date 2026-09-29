import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { inviteUserAction, setDisabledAction, setRoleAction } from "@/app/actions/admin.ts";

type Row = { id: string; name: string; email: string; phone: string; role: string; disabled: boolean; created_at: string; listings: number; bookings: number };

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; role?: string }> }) {
  const me = await requireUser(["admin"]);
  const sp = await searchParams;
  const term = (sp.q || "").trim().slice(0, 80);
  const role = ["customer", "host", "admin"].includes(sp.role || "") ? sp.role! : "";
  const rows = await q<Row>(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.disabled, u.created_at,
            (SELECT count(*) FROM properties p WHERE p.host_id = u.id) AS listings,
            (SELECT count(*) FROM bookings b WHERE b.guest_id = u.id) AS bookings
     FROM users u WHERE ($1 = '' OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%') AND ($2 = '' OR u.role = $2)
     ORDER BY u.created_at DESC LIMIT 300`,
    [term, role],
  );
  return (
    <div className="stack" style={{ gap: 20 }}>
      <form className="row" method="get">
        <input className="input" name="q" defaultValue={term} placeholder="Search name or email" style={{ maxWidth: 320 }} />
        <select className="input" name="role" defaultValue={role} style={{ width: "auto" }}><option value="">All roles</option><option value="customer">Guests</option><option value="host">Hosts</option><option value="admin">Admins</option></select>
        <button className="btn btn-ghost">Search</button>
      </form>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th className="num">Listings</th><th className="num">Bookings</th><th>Role</th><th>Account</th></tr></thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id} style={u.disabled ? { opacity: 0.6 } : undefined}>
                <td><strong>{u.name}</strong>{u.phone && <div className="hint">{u.phone}</div>}</td>
                <td>{u.email}</td>
                <td>{new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                <td className="num">{u.listings || "—"}</td>
                <td className="num">{u.bookings || "—"}</td>
                <td style={{ minWidth: 200 }}>
                  {u.id === me.id ? <span className="pill neutral">Admin (you)</span> : (
                    <ActionForm action={setRoleAction} className="row">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="role" defaultValue={u.role} aria-label={`Role for ${u.name}`}><option value="customer">Guest</option><option value="host">Host</option><option value="admin">Admin</option></select>
                      <SubmitButton className="btn btn-ghost btn-sm" pendingText="…">Save</SubmitButton>
                    </ActionForm>
                  )}
                </td>
                <td>
                  {u.id !== me.id && (
                    <form action={setDisabledAction}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="disabled" value={u.disabled ? "0" : "1"} /><button className={`btn btn-sm ${u.disabled ? "btn-ghost" : "btn-danger"}`}>{u.disabled ? "Turn on" : "Turn off"}</button></form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Changing someone's role signs them out so the new access applies immediately. Turned-off accounts can't sign in.</p>
      <ActionForm action={inviteUserAction} className="box" resetOnOk>
        <h3>Invite a host or admin</h3>
        <p className="muted">They'll get an email with a link to choose their password.</p>
        <div className="grid-2">
          <label className="field"><span>Name</span><input className="input" name="name" /></label>
          <label className="field"><span>Email</span><input className="input" name="email" type="email" /></label>
        </div>
        <label className="field" style={{ maxWidth: 280 }}><span>Role</span><select className="input" name="role" defaultValue="host"><option value="host">Host</option><option value="admin">Admin</option><option value="customer">Guest</option></select></label>
        <div><SubmitButton pendingText="Sending…">Send invitation</SubmitButton></div>
      </ActionForm>
    </div>
  );
}

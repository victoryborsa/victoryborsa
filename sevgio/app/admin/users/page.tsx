import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { approveHostAction, confirmEmailAction, inviteUserAction, setDisabledAction, setRoleAction } from "@/app/actions/admin.ts";

type Row = { id: string; name: string; email: string; phone: string; role: string; disabled: boolean; created_at: string; listings: number; bookings: number; verified: boolean; host_requested: boolean };

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; role?: string }> }) {
  const me = await requireUser(["admin"]);
  const sp = await searchParams;
  const term = (sp.q || "").trim().slice(0, 80);
  const role = ["customer", "host", "admin", "requests"].includes(sp.role || "") ? sp.role! : "";
  const rows = await q<Row>(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.disabled, u.created_at, u.email_verified_at IS NOT NULL AS verified, u.host_requested_at IS NOT NULL AS host_requested,
            (SELECT count(*) FROM properties p WHERE p.host_id = u.id) AS listings,
            (SELECT count(*) FROM bookings b WHERE b.guest_id = u.id) AS bookings
     FROM users u WHERE ($1 = '' OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%') AND ($2 = '' OR u.role = $2 OR ($2 = 'requests' AND u.host_requested_at IS NOT NULL))
     ORDER BY u.created_at DESC LIMIT 300`,
    [term, role],
  );
  return (
    <div className="stack" style={{ gap: 20 }}>
      <form className="row" method="get">
        <input className="input" name="q" defaultValue={term} placeholder="Search name or email" style={{ maxWidth: 320 }} />
        <select className="input" name="role" defaultValue={role} style={{ width: "auto" }}><option value="">All roles</option><option value="customer">Guests</option><option value="host">Hosts</option><option value="admin">Admins</option><option value="requests">Host requests</option></select>
        <button className="btn btn-ghost">Search</button>
      </form>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th className="num">Listings</th><th className="num">Bookings</th><th>Role</th><th>Account</th></tr></thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id} style={u.disabled ? { opacity: 0.6 } : undefined}>
                <td><strong>{u.name}</strong>{u.host_requested && (
                  <div className="row host-request" style={{ gap: 6, marginTop: 6 }}>
                    <span className="pill warn">Wants to host</span>
                    <form action={approveHostAction}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="decision" value="approve" /><button className="btn btn-primary btn-sm" type="submit">Approve as host</button></form>
                    <form action={approveHostAction}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="decision" value="decline" /><button className="linkbtn" type="submit">Decline</button></form>
                  </div>
                )}{u.phone && <div className="hint">{u.phone}</div>}</td>
                <td>{u.email}{!u.verified && <div className="row" style={{ gap: 6, marginTop: 4 }}><span className="pill warn">Not confirmed</span><form action={confirmEmailAction}><input type="hidden" name="id" value={u.id} /><button className="linkbtn" type="submit">Confirm by hand</button></form></div>}</td>
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
        <h3>Add a host, owner or admin</h3>
        <p className="muted">Owners and hosts can see only their own listings, bookings and statements. You still see and manage everything.</p>
        <div className="grid-2">
          <label className="field"><span>Name</span><input className="input" name="name" /></label>
          <label className="field"><span>Email</span><input className="input" name="email" type="email" /></label>
        </div>
        <label className="field" style={{ maxWidth: 280 }}><span>Role</span><select className="input" name="role" defaultValue="host"><option value="host">Host</option><option value="admin">Admin</option><option value="customer">Guest</option></select></label>
        <label className="chk"><input type="checkbox" name="notify" defaultChecked />Send them an invitation email to set a password</label>
        <p className="hint">Adding a property owner just for your records? Untick the box. You keep managing their listings as admin, and they can still sign in later with “Forgot your password?”.</p>
        <div><SubmitButton pendingText="Saving…">Add person</SubmitButton></div>
      </ActionForm>
    </div>
  );
}

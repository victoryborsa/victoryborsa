import Link from "next/link";
import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { importListingsAction } from "@/app/actions/host.ts";

export default async function ImportListings() {
  const u = await requireUser(["host", "admin"], "/host/listings/import");
  const hosts = u.role === "admin" ? await q<{ id: string; name: string }>("SELECT id, name FROM users WHERE role IN ('host','admin') AND NOT disabled ORDER BY name") : [];
  return (
    <>
      <div className="crumbs" style={{ paddingTop: 0 }}><Link href="/host/listings">← Listings</Link></div>
      <h2 style={{ marginBottom: 8 }}>Import listings</h2>
      <p className="muted" style={{ marginBottom: 16, maxWidth: "70ch" }}>Upload a listing file (.json) to create one or more listings at once, for example a house and all its rooms. Everything is created as a <b>draft</b>, so nothing is visible to guests until you check it and publish.</p>
      <ActionForm action={importListingsAction} className="box" resetOnOk>
        {u.role === "admin" && (
          <label className="field" style={{ maxWidth: 360 }}><span>Host for these listings</span>
            <select className="input" name="host_id" defaultValue={u.id}>{hosts.map(h => <option key={h.id} value={h.id}>{h.name}{h.id === u.id ? " (you)" : ""}</option>)}</select>
          </label>
        )}
        <label className="field"><span>Listing file</span><input className="input" type="file" name="file" accept=".json,application/json" /></label>
        <details>
          <summary className="linkbtn" style={{ cursor: "pointer" }}>Or paste the file's text instead</summary>
          <textarea className="input mono" name="json" style={{ minHeight: 160, marginTop: 8, fontSize: 13 }} placeholder='[{ "title": "…", "city": "…" }]' />
        </details>
        <div><SubmitButton pendingText="Importing… photos can take a minute">Import as drafts</SubmitButton></div>
      </ActionForm>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth.ts";
import { fmtDate, fmtWhen, type Instant } from "@/lib/dates.ts";
import { channelLabel } from "@/lib/channels.ts";
import { canUndo, getImport, importChanges, undoStep } from "@/lib/import-undo.ts";
import { putBackImportAction, undoImportAction } from "@/app/actions/channel.ts";

const when = (t: Instant) => fmtWhen(t);

const DONE: Record<string, string> = {
  undone: "Import undone. The reservations it added are gone and the ones it changed are back as they were. A copy of everything was saved first, so you can put it back below.",
  already: "This import was already undone.",
  putback: "Import put back as it was before the undo.",
};

/** One import: what it added and changed, and the button to undo it (or to put it back after an undo). */
export default async function ImportReview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const { id } = await params;
  const u = await requireUser(["host", "admin"], `/host/finance/import/${id}`);
  const imp = await getImport(id);
  if (!imp || !canUndo(u, imp)) notFound();
  const done = DONE[(await searchParams).done || ""];
  const changes = (await importChanges(id)).map(c => ({ ...c, step: undoStep(c, imp.legacy) }));
  const added = changes.filter(c => c.action === "create"), changed = changes.filter(c => c.action === "update");
  const undone = imp.status === "undone";
  const site = channelLabel(imp.channel);
  const dates = (a: string | null, b: string | null) => (a && b ? `${fmtDate(a)} → ${fmtDate(b)}` : "–");
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 960 }}>
      <p><Link href="/host/finance/import">‹ Import reservations or payouts</Link></p>
      {done && <div className="notice ok" role="status">{done}</div>}
      <h2>{site} import · {imp.file_name || "file"}</h2>
      <p className="hint">
        Imported {when(imp.created_at)}{imp.user_name ? ` by ${imp.user_name}` : ""}. {imp.rows} lines: {imp.created} added as new reservations, {imp.updated} matched to existing ones, {imp.skipped} skipped.
        {undone && imp.undone_at ? <> <b>Undone {when(imp.undone_at)}</b>: {imp.undo_note}.</> : null}
      </p>
      {imp.legacy && !undone && (
        <div className="notice warn">This import was made before import history existed, so its reservations were found by time: the ones this file added within the 30 minutes before it finished. Check the list below. Reservations it changed have the guest names, references and amounts from the file removed, and the calendar link decides again whether each stay is a reservation.</div>
      )}

      {!undone ? (
        <form action={undoImportAction} className="box stack imp-undo">
          <input type="hidden" name="id" value={imp.id} />
          <p><b>Undo this import</b> removes the {added.filter(c => c.step.action === "remove").length} reservations listed under “Added by this import” and their blocked dates, and puts the {changed.filter(c => c.step.action === "restore").length} under “Changed by this import” back as they were. Nothing else is touched: reservations from calendar links, direct bookings and other imports stay as they are. A copy of every row is saved first.</p>
          <div className="row"><button className="btn btn-danger" type="submit">Undo this import</button></div>
        </form>
      ) : (
        <form action={putBackImportAction} className="box stack">
          <input type="hidden" name="id" value={imp.id} />
          <p>Undid the wrong import? <b>Put it back</b> restores exactly what the undo removed or changed, from the copy saved before it.</p>
          <div className="row"><button className="btn btn-ghost" type="submit">Put it back</button></div>
        </form>
      )}

      <section>
        <h3>Added by this import ({added.length})</h3>
        {added.length === 0 ? <p className="hint">None.</p> : (
          <div className="tbl-wrap"><table className="tbl" aria-label="Added by this import">
            <thead><tr><th>Dates</th><th>Listing</th><th>Reference</th><th>Guest</th><th>{undone ? "Now" : "Undo will"}</th></tr></thead>
            <tbody>{added.map(c => (
              <tr key={c.reservation_id} data-res={c.reservation_id}>
                <td>{dates(c.check_in, c.check_out)}</td><td>{c.place || "–"}</td><td className="mono">{c.external_ref || "–"}</td><td>{c.guest_name || "–"}</td>
                <td>{!c.exists ? <span className="hint">{undone ? "Removed" : "Already removed"}</span> : <span className="pill warn">Remove</span>}</td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </section>

      <section>
        <h3>Changed by this import ({changed.length})</h3>
        {changed.length === 0 ? <p className="hint">None.</p> : (
          <div className="tbl-wrap"><table className="tbl" aria-label="Changed by this import">
            <thead><tr><th>Dates</th><th>Listing</th><th>Reference</th><th>Guest</th><th>{undone ? "Now" : "Undo will"}</th></tr></thead>
            <tbody>{changed.map(c => (
              <tr key={c.reservation_id} data-res={c.reservation_id}>
                <td>{dates(c.check_in, c.check_out)}</td><td>{c.place || "–"}</td><td className="mono">{c.external_ref || "–"}</td><td>{c.guest_name || "–"}</td>
                <td>{undone ? <span className="hint">Put back as before the import</span> : !c.exists ? <span className="hint">Reservation no longer exists</span>
                  : c.step.action === "restore" ? <>Put back {c.step.restored.join(", ") || "how it was"}{c.step.kept.length ? <span className="hint"> (keeps {c.step.kept.join(", ")}, changed since)</span> : null}</>
                  : <span className="hint">Nothing to put back{c.step.kept.length ? ` (${c.step.kept.join(", ")} changed since)` : ""}</span>}</td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

import { one, q, tx, type Db } from "./db.ts";
import { IMPORT_FIELDS } from "./payout-apply.ts";
import { classifyEvent } from "./channels.ts";
import { rebuildFeedBlocks, syncManualBlock } from "./channel-res.ts";

export type ImportRow = {
  id: string; user_id: string | null; user_name: string | null; file_name: string; channel: string; rows: number; updated: number; created: number; skipped: number;
  created_at: string; status: "running" | "done" | "undone"; legacy: boolean; undone_at: string | null; undo_note: string;
};

type Fields = Record<string, unknown>;
export type ChangeRow = {
  reservation_id: string; action: "create" | "update"; before: Fields | null; after: Fields | null;
  exists: boolean; place: string; property_id: string | null; channel: string; source: string; feed_id: string | null; summary: string; feed_detail: string;
  check_in: string | null; check_out: string | null; external_ref: string; guest_name: string; status: string; kind: string; current: Fields | null;
};

/** What undo does to one reservation: remove it, put some fields back, or nothing (already gone, or changed by someone since). */
export type UndoStep = { action: "remove" | "restore" | "none"; patch: Fields; restored: string[]; kept: string[] };

const LABEL: Record<string, string> = {
  guest_name: "guest name", external_ref: "reference", status: "status", kind: "reservation or closed dates", kind_locked: "", guests: "guests",
  rent_cents: "amounts", cleaning_cents: "amounts", other_cents: "amounts", tax_cents: "amounts", commission_cents: "amounts", refund_cents: "amounts",
  expected_payout_cents: "amounts", received_payout_cents: "amounts", payout_date: "payout date", finance_source: "", guest_name_source: "", ref_source: "", cancelled_at: "",
};
const words = (keys: string[]) => [...new Set(keys.map(k => LABEL[k]).filter(Boolean))];
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const MONEY = ["rent_cents", "cleaning_cents", "other_cents", "tax_cents", "commission_cents", "refund_cents", "expected_payout_cents", "received_payout_cents", "payout_date"];

export function undoStep(ch: ChangeRow, legacy: boolean): UndoStep {
  if (!ch.exists || !ch.current) return { action: "none", patch: {}, restored: [], kept: [] };
  if (ch.action === "create") return { action: "remove", patch: {}, restored: [], kept: [] };
  const cur = ch.current, patch: Fields = {};
  if (ch.before && ch.after) {
    // Put back only what still holds the value this import wrote; anything changed since (a name typed in, a later sync) is kept.
    const kept: string[] = [];
    for (const k of IMPORT_FIELDS) {
      if (same(ch.before[k], ch.after[k])) continue;
      if (same(cur[k], ch.after[k])) patch[k] = ch.before[k] ?? null; else kept.push(k);
    }
    return { action: Object.keys(patch).length ? "restore" : "none", patch, restored: words(Object.keys(patch)), kept: words(kept) };
  }
  // Imports made before this history existed have no "before" copy: remove what the file brought in, and let the
  // calendar link decide again whether the dates are a reservation.
  if (legacy) {
    if (cur.guest_name_source === "import") Object.assign(patch, { guest_name: "", guest_name_source: "" });
    if (cur.ref_source === "import") Object.assign(patch, { external_ref: "", ref_source: "" });
    if (cur.finance_source === "import") { for (const k of MONEY) patch[k] = null; patch.finance_source = "none"; }
    if (ch.source === "ical" && cur.kind_locked) Object.assign(patch, { kind_locked: false, kind: classifyEvent(ch.channel, ch.summary, ch.feed_detail).kind });
  }
  return { action: Object.keys(patch).length ? "restore" : "none", patch, restored: words(Object.keys(patch)), kept: [] };
}

const IMPORT_SQL = `SELECT i.id, i.user_id, u.name AS user_name, i.file_name, i.channel, i.rows, i.updated, i.created, i.skipped, i.created_at, i.status, i.legacy, i.undone_at, i.undo_note
  FROM channel_imports i LEFT JOIN users u ON u.id = i.user_id`;

export async function listImports(u: { id: string; role: string }, limit = 20): Promise<ImportRow[]> {
  return u.role === "admin"
    ? q<ImportRow>(`${IMPORT_SQL} ORDER BY i.created_at DESC LIMIT $1`, [limit])
    : q<ImportRow>(`${IMPORT_SQL} WHERE i.user_id = $1 ORDER BY i.created_at DESC LIMIT $2`, [u.id, limit]);
}

export async function getImport(id: string, db: Db | undefined = undefined, lock = false): Promise<ImportRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one<ImportRow>(`${IMPORT_SQL} WHERE i.id = $1${lock ? " FOR UPDATE OF i" : ""}`, [id], db);
}

/** Admins can review and undo any import; a host, the imports they made. */
export const canUndo = (u: { id: string; role: string }, imp: ImportRow) => u.role === "admin" || imp.user_id === u.id;

export async function importChanges(id: string, db?: Db): Promise<ChangeRow[]> {
  return q<ChangeRow>(
    `SELECT ch.reservation_id, ch.action, ch.before, ch.after, c.id IS NOT NULL AS exists,
       coalesce(hp.title || ' › ' || p.title, p.title, '') AS place, coalesce(c.property_id, (bk.row->>'property_id')::uuid) AS property_id,
       coalesce(c.channel, bk.row->>'channel', '') AS channel, coalesce(c.source, '') AS source, c.feed_id,
       coalesce(c.summary, '') AS summary, coalesce(c.feed_detail, '') AS feed_detail,
       coalesce(c.check_in, (bk.row->>'check_in')::date) AS check_in, coalesce(c.check_out, (bk.row->>'check_out')::date) AS check_out,
       coalesce(c.external_ref, bk.row->>'external_ref', '') AS external_ref, coalesce(c.guest_name, bk.row->>'guest_name', '') AS guest_name,
       coalesce(c.status, '') AS status, coalesce(c.kind, '') AS kind,
       (SELECT jsonb_object_agg(k, v) FROM jsonb_each(to_jsonb(c)) e(k, v) WHERE k = ANY($2)) AS current
     FROM channel_import_changes ch
     LEFT JOIN channel_reservations c ON c.id = ch.reservation_id
     LEFT JOIN LATERAL (SELECT b.row FROM channel_import_backups b WHERE b.import_id = ch.import_id AND b.reservation_id = ch.reservation_id ORDER BY b.taken_at DESC LIMIT 1) bk ON true
     LEFT JOIN properties p ON p.id = coalesce(c.property_id, (bk.row->>'property_id')::uuid) LEFT JOIN properties hp ON hp.id = p.parent_id
     WHERE ch.import_id = $1 ORDER BY ch.action, coalesce(c.check_in, (bk.row->>'check_in')::date) NULLS LAST`, [id, IMPORT_FIELDS], db);
}

const COLS = IMPORT_FIELDS.join(", ");
const setFields = (db: Db, id: string, patch: Fields) =>
  q(`UPDATE channel_reservations c SET (${COLS}, updated_at) = (SELECT ${COLS}, now() FROM jsonb_populate_record(c, $2::jsonb)) WHERE c.id = $1`, [id, JSON.stringify(patch)], db);

export type UndoResult = { removed: number; restored: number; untouched: number };

/**
 * Reverses one import: removes the reservations it added (and their blocked nights) and puts back the fields it
 * changed on others. Every reservation touched is first copied to channel_import_backups, so putBackImport can
 * reverse the undo. Nothing outside this import's own change list is read or written.
 */
export async function undoImport(id: string, userId: string, today: string): Promise<UndoResult> {
  const res: UndoResult = { removed: 0, restored: 0, untouched: 0 };
  const touched = await tx(async c => {
    const imp = await getImport(id, c, true);
    if (!imp) throw new Error("Import not found");
    if (imp.status === "undone") throw new Error("This import was already undone");
    const after: string[] = [];
    for (const ch of await importChanges(id, c)) {
      const step = undoStep(ch, imp.legacy);
      if (step.action === "none") { res.untouched++; continue; }
      await q(`INSERT INTO channel_import_backups (import_id, reservation_id, action, row, blocks)
               SELECT $1, c.id, $3, to_jsonb(c), coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM blocks b WHERE b.source = 'res:' || c.id), '[]')
               FROM channel_reservations c WHERE c.id = $2`, [id, ch.reservation_id, ch.action], c);
      if (step.action === "remove") {
        await q("DELETE FROM blocks WHERE source = $1", ["res:" + ch.reservation_id], c);
        await q("DELETE FROM channel_reservations WHERE id = $1", [ch.reservation_id], c);
        res.removed++;
      } else {
        await setFields(c, ch.reservation_id, step.patch);
        after.push(ch.reservation_id);
        res.restored++;
      }
    }
    const note = `${res.removed} added reservation${res.removed === 1 ? "" : "s"} removed, ${res.restored} put back as before${res.untouched ? `, ${res.untouched} already changed or gone` : ""}`;
    await q("UPDATE channel_imports SET status = 'undone', undone_at = now(), undone_by = $2, undo_note = $3 WHERE id = $1", [id, userId, note], c);
    return after;
  });
  await refreshBlocks(touched, today);
  return res;
}

/** Reverses an undo from the copies it took: re-adds the removed reservations and restores the changed fields. */
export async function putBackImport(id: string, today: string): Promise<number> {
  const ids = await tx(async c => {
    const imp = await getImport(id, c, true);
    if (!imp || imp.status !== "undone") throw new Error("This import isn't undone");
    const backups = await q<{ reservation_id: string; action: string; row: Fields & { channel: string; external_ref: string } }>(
      `SELECT reservation_id, action, row FROM channel_import_backups
       WHERE import_id = $1 AND taken_at = (SELECT max(taken_at) FROM channel_import_backups WHERE import_id = $1)`, [id], c);
    const out: string[] = [];
    for (const b of backups) {
      const exists = await one("SELECT 1 FROM channel_reservations WHERE id = $1", [b.reservation_id], c);
      if (b.action === "create" && !exists) {
        const row = { ...b.row };
        if (row.external_ref && await one("SELECT 1 FROM channel_reservations WHERE channel = $1 AND lower(external_ref) = lower($2)", [row.channel, row.external_ref], c))
          Object.assign(row, { external_ref: "", ref_source: "" });
        await q("INSERT INTO channel_reservations SELECT * FROM jsonb_populate_record(NULL::channel_reservations, $1::jsonb)", [JSON.stringify(row)], c);
      } else if (exists) {
        await setFields(c, b.reservation_id, Object.fromEntries(IMPORT_FIELDS.map(k => [k, b.row[k] ?? null])));
      } else continue;
      out.push(b.reservation_id);
    }
    await q("UPDATE channel_imports SET status = 'done', undone_at = NULL, undone_by = NULL, undo_note = 'Put back after an undo' WHERE id = $1", [id], c);
    return out;
  });
  await refreshBlocks(ids, today);
  return ids.length;
}

/** Recomputes blocked nights for the reservations an undo or put-back changed. Callers then re-check double bookings. */
async function refreshBlocks(ids: string[], today: string) {
  const rows = ids.length ? await q<{ id: string; property_id: string; check_in: string; check_out: string; status: string; summary: string; feed_id: string | null; feed_property: string | null; source: string }>(
    `SELECT c.id, c.property_id, c.check_in, c.check_out, c.status, c.summary, c.feed_id, f.property_id AS feed_property, c.source
     FROM channel_reservations c LEFT JOIN ical_feeds f ON f.id = c.feed_id WHERE c.id = ANY($1)`, [ids]) : [];
  const feeds = new Map<string, string>();
  for (const r of rows) {
    if (r.feed_id && r.feed_property) feeds.set(r.feed_id, r.feed_property);
    else if (r.source !== "ical") await syncManualBlock({ ...r, summary: r.summary || "Reserved" }, today);
  }
  for (const [fid, pid] of feeds) await rebuildFeedBlocks({ id: fid, property_id: pid }, today);
}

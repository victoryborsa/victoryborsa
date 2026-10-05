import { one, q } from "./db.ts";
import { matchListing, type PayoutRecord } from "./payout-import.ts";
import { syncManualBlock } from "./channel-res.ts";
import { channelLabel } from "./channels.ts";

export type ImportOptions = { channel: string; defaultProperty: string | null; markReceived: boolean; dryRun: boolean; today: string; userId?: string | null; fileName?: string };
export type ImportOutcome = { key: string; ref: string; check_in: string | null; check_out: string | null; action: "update" | "create" | "skip"; place: string; reason?: string; payout: number | null };
export type ImportSummary = { updated: number; created: number; skipped: number; outcomes: ImportOutcome[] };

type Target = { id: string; property_id: string; external_ref: string; guest_name: string; guests: number | null; received_payout_cents: number | null };

/**
 * Applies payout records to reservations: matched by confirmation code first, then by listing and exact dates.
 * Records that match nothing become new reservations when their listing is known. Running the same file again
 * gives the same result (amounts are replaced, not added), so a re-import never double counts.
 * With dryRun, nothing is saved; the outcome shows what would happen.
 */
export async function applyPayoutRecords(listings: { id: string; title: string; parent_id: string | null }[], records: PayoutRecord[], o: ImportOptions): Promise<ImportSummary> {
  const ids = listings.map(l => l.id);
  const title = (id: string) => { const l = listings.find(x => x.id === id); const h = l?.parent_id ? listings.find(x => x.id === l.parent_id) : null; return l ? (h ? `${h.title} › ${l.title}` : l.title) : ""; };
  const sum: ImportSummary = { updated: 0, created: 0, skipped: 0, outcomes: [] };
  const used = new Set<string>();
  for (const r of records) {
    const base = { key: r.key, ref: r.ref, check_in: r.check_in, check_out: r.check_out, payout: r.payout };
    const skip = (reason: string) => { sum.skipped++; sum.outcomes.push({ ...base, action: "skip", place: "", reason }); };
    const named = r.listing ? matchListing(r.listing, listings) : null;
    let t: Target | null = null;
    if (r.ref) t = await one<Target>(
      `SELECT id, property_id, external_ref, guest_name, guests, received_payout_cents FROM channel_reservations
       WHERE lower(external_ref) = lower($1) AND channel = $2 AND property_id = ANY($3)`, [r.ref, o.channel, ids]);
    if (!t && r.check_in && r.check_out) {
      const same = await q<Target>(
        `SELECT id, property_id, external_ref, guest_name, guests, received_payout_cents FROM channel_reservations
         WHERE check_in = $1 AND check_out = $2 AND channel = $3 AND property_id = ANY($4) ORDER BY status, kind`,
        [r.check_in, r.check_out, o.channel, named ? [named.id] : ids]);
      // A different confirmation code already on the row means it's another reservation.
      const free = same.filter(x => !used.has(x.id) && (!x.external_ref || !r.ref || x.external_ref.toUpperCase() === r.ref));
      if (free.length > 1) { skip(`${free.length} reservations on these dates; add the listing name column or a confirmation code`); continue; }
      t = free[0] || null;
    }
    if (t && used.has(t.id)) { skip("Already matched by another line in this file"); continue; }
    if (t) {
      used.add(t.id);
      sum.updated++;
      sum.outcomes.push({ ...base, action: "update", place: title(t.property_id) });
      if (!o.dryRun) await saveFinance(t.id, r, o, t);
      continue;
    }
    const pid = named?.id || o.defaultProperty;
    if (!pid) { skip(r.listing ? `No listing called "${r.listing}"; choose one for unmatched lines` : "No matching reservation; choose a listing for unmatched lines"); continue; }
    if (!r.check_in || !r.check_out || r.check_out <= r.check_in) { skip("No matching reservation, and the line has no check-in and check-out dates"); continue; }
    sum.created++;
    sum.outcomes.push({ ...base, action: "create", place: title(pid) });
    if (o.dryRun) continue;
    const refFree = r.ref && !(await one("SELECT 1 FROM channel_reservations WHERE channel = $1 AND lower(external_ref) = lower($2)", [o.channel, r.ref]));
    const row = await one<Target & { check_in: string; check_out: string; status: string }>(
      `INSERT INTO channel_reservations (property_id, channel, kind, kind_locked, source, external_ref, check_in, check_out, summary, guest_name, guest_name_source, guests, status, cancelled_at)
       VALUES ($1, $2, 'reservation', true, 'import', $3, $4, $5, $6, $7, CASE WHEN $7 = '' THEN '' ELSE 'import' END, $8, $9, CASE WHEN $9 = 'cancelled' THEN now() END)
       RETURNING id, property_id, external_ref, guest_name, guests, received_payout_cents, check_in, check_out, status`,
      [pid, o.channel, refFree ? r.ref : "", r.check_in, r.check_out, `${channelLabel(o.channel)} reservation${r.ref ? " " + r.ref : ""}`, r.guest, r.guests, r.cancelled ? "cancelled" : "confirmed"]);
    used.add(row!.id);
    await saveFinance(row!.id, r, o, row!);
    await syncManualBlock({ ...row!, summary: `${channelLabel(o.channel)}: Reserved` }, o.today);
  }
  if (!o.dryRun) await q("INSERT INTO channel_imports (user_id, file_name, channel, rows, updated, created, skipped) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [o.userId ?? null, (o.fileName || "").slice(0, 200), o.channel, records.length, sum.updated, sum.created, sum.skipped]);
  return sum;
}

async function saveFinance(id: string, r: PayoutRecord, o: ImportOptions, t: Target) {
  const received = r.received ?? (o.markReceived ? r.payout : t.received_payout_cents);
  const refFree = !t.external_ref && r.ref && !(await one("SELECT 1 FROM channel_reservations WHERE channel = $1 AND lower(external_ref) = lower($2) AND id <> $3", [o.channel, r.ref, id]));
  await q(
    `UPDATE channel_reservations SET
       rent_cents = coalesce($2, rent_cents), cleaning_cents = coalesce($3, cleaning_cents), other_cents = coalesce($4, other_cents), tax_cents = coalesce($5, tax_cents),
       commission_cents = coalesce($6, commission_cents), refund_cents = coalesce($7, refund_cents), expected_payout_cents = coalesce($8, expected_payout_cents),
       received_payout_cents = $9, payout_date = coalesce($10, payout_date), finance_source = 'import', kind = 'reservation', kind_locked = true,
       external_ref = CASE WHEN $11 THEN $12 ELSE external_ref END, guest_name = CASE WHEN guest_name = '' THEN $13 ELSE guest_name END,
       guest_name_source = CASE WHEN guest_name = '' AND $13 <> '' THEN 'import' ELSE guest_name_source END, guests = coalesce(guests, $14),
       status = CASE WHEN $15 THEN 'cancelled' ELSE status END, cancelled_at = CASE WHEN $15 AND cancelled_at IS NULL THEN now() ELSE cancelled_at END, updated_at = now()
     WHERE id = $1`,
    [id, r.rent, r.cleaning, r.other, r.tax, r.commission, r.refund, r.payout, received, r.payout_date, !!refFree, r.ref, r.guest, r.guests, r.cancelled]);
}

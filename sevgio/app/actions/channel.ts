"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { one, q } from "@/lib/db.ts";
import { requireUser, type User } from "@/lib/auth.ts";
import { str, type ActionState } from "@/lib/validate.ts";
import { toCents } from "@/lib/money.ts";
import { isIsoDate, todayLocal } from "@/lib/dates.ts";
import { financeListings } from "@/lib/finance.ts";
import { channelLabel, isChannel } from "@/lib/channels.ts";
import { syncManualBlock } from "@/lib/channel-res.ts";
import { FIELDS, guessMapping, parseCsv, toRecords, type Field, type Mapping } from "@/lib/payout-import.ts";
import { applyPayoutRecords, type ImportSummary } from "@/lib/payout-apply.ts";
import { logEvent } from "@/lib/log.ts";

type Row = { id: string; property_id: string; source: string; check_in: string; check_out: string; status: string; summary: string; channel: string };

/** A reservation from another site that this person may manage, or null. */
async function manageable(u: User, id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const r = await one<Row>("SELECT id, property_id, source, check_in, check_out, status, summary, channel FROM channel_reservations WHERE id = $1", [id]);
  if (!r) return null;
  return (await financeListings(u)).some(l => l.id === r.property_id) ? r : null;
}

const MONEY = [["rent", "rent_cents"], ["cleaning", "cleaning_cents"], ["other", "other_cents"], ["tax", "tax_cents"], ["commission", "commission_cents"],
  ["refund", "refund_cents"], ["expected", "expected_payout_cents"], ["received", "received_payout_cents"]] as const;

function readMoney(fd: FormData): { values: Record<string, number | null> } | { error: string } {
  const values: Record<string, number | null> = {};
  for (const [k, col] of MONEY) {
    const raw = str(fd, k, 30);
    if (raw === "") { values[col] = null; continue; }
    const c = toCents(raw);
    if (c == null) return { error: `Check the ${k === "expected" ? "expected payout" : k === "received" ? "received payout" : k} amount: use a number like 125.50, or leave it empty if you don't know it.` };
    values[col] = c;
  }
  return { values };
}

/** Saves payout details for a reservation from another site, or adds one by hand (for sites without a calendar link). */
export async function saveChannelResAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser(["host", "admin"]);
  const id = str(fd, "id", 40);
  const m = readMoney(fd);
  if ("error" in m) return { error: m.error };
  const payoutDate = str(fd, "payout_date", 10);
  if (payoutDate && !isIsoDate(payoutDate)) return { error: "Choose a payout date, or leave it empty." };
  const guests = str(fd, "guests", 3) ? Math.round(Number(str(fd, "guests", 3))) : null;
  if (guests != null && !(guests >= 1 && guests <= 50)) return { error: "Guests must be a number from 1 to 50." };
  const anyMoney = Object.values(m.values).some(v => v != null);
  const kind = ["reservation", "blocked"].includes(str(fd, "kind")) ? str(fd, "kind") : "reservation";
  const ref = str(fd, "ref", 40).toUpperCase(), guest = str(fd, "guest_name", 80), note = str(fd, "note", 1000);
  const today = todayLocal();

  if (id) {
    const r = await manageable(u, id);
    if (!r) return { error: "You can't manage this reservation." };
    if (ref && await one("SELECT 1 FROM channel_reservations WHERE channel = $1 AND lower(external_ref) = lower($2) AND id <> $3", [r.channel, ref, id]))
      return { error: `Another ${channelLabel(r.channel)} reservation already has the code ${ref}.` };
    await q(
      `UPDATE channel_reservations SET rent_cents = $2, cleaning_cents = $3, other_cents = $4, tax_cents = $5, commission_cents = $6, refund_cents = $7,
         expected_payout_cents = $8, received_payout_cents = $9, payout_date = $10, finance_source = CASE WHEN $11 THEN 'manual' ELSE 'none' END,
         ref_source = CASE WHEN $12 = external_ref THEN ref_source WHEN $12 = '' THEN '' ELSE 'manual' END, external_ref = $12, ${fd.has("guest_name") ? NAME_SET("$13", "$17") : "guest_name = guest_name, guest_name_by = coalesce(guest_name_by, $17::uuid)"}, guests = $14, note = $15, kind = $16, kind_locked = true, updated_at = now()
       WHERE id = $1`,
      [id, m.values.rent_cents, m.values.cleaning_cents, m.values.other_cents, m.values.tax_cents, m.values.commission_cents, m.values.refund_cents,
        m.values.expected_payout_cents, m.values.received_payout_cents, payoutDate || null, anyMoney, ref, guest, guests, note, kind, u.id]);
    await logEvent("info", "Finance", `Updated payout details for ${channelLabel(r.channel)} reservation ${ref || r.check_in}`, { reservation: id }, u.id);
    revalidatePath("/host/bookings/other-sites");
    return { ok: "Saved. Finance and statements now use these amounts." };
  }

  // A new reservation entered by hand.
  const pid = str(fd, "property", 40), channel = str(fd, "channel", 20), ci = str(fd, "check_in", 10), co = str(fd, "check_out", 10);
  if (!(await financeListings(u)).some(l => l.id === pid)) return { error: "Choose the listing (home or room) this reservation is for." };
  if (!isChannel(channel) || channel === "sevgio") return { error: "Choose the site it was booked on." };
  if (!isIsoDate(ci) || !isIsoDate(co) || co <= ci) return { error: "Choose a check-in date and a later check-out date." };
  if (ref && await one("SELECT 1 FROM channel_reservations WHERE channel = $1 AND lower(external_ref) = lower($2)", [channel, ref]))
    return { error: `A ${channelLabel(channel)} reservation with the code ${ref} is already here. Open it from Other sites to edit it.` };
  const row = await one<Row>(
    `INSERT INTO channel_reservations (property_id, channel, kind, kind_locked, source, external_ref, check_in, check_out, summary, guest_name, guests, note,
       rent_cents, cleaning_cents, other_cents, tax_cents, commission_cents, refund_cents, expected_payout_cents, received_payout_cents, payout_date, finance_source,
       guest_name_source, guest_name_by, guest_name_at, ref_source)
     VALUES ($1, $2, $3, true, 'manual', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
       CASE WHEN $8 = '' THEN '' ELSE 'manual' END, CASE WHEN $8 = '' THEN NULL ELSE $21::uuid END, CASE WHEN $8 = '' THEN NULL ELSE now() END, CASE WHEN $4 = '' THEN '' ELSE 'manual' END)
     RETURNING id, property_id, source, check_in, check_out, status, summary, channel`,
    [pid, channel, kind, ref, ci, co, `${channelLabel(channel)}: ${kind === "blocked" ? "Not available" : "Reserved"}`, guest, guests, note,
      m.values.rent_cents, m.values.cleaning_cents, m.values.other_cents, m.values.tax_cents, m.values.commission_cents, m.values.refund_cents,
      m.values.expected_payout_cents, m.values.received_payout_cents, payoutDate || null, anyMoney ? "manual" : "none", u.id]);
  await syncManualBlock(row!, today);
  await logEvent("info", "Finance", `Added a ${channelLabel(channel)} reservation by hand, ${ci} to ${co}`, { reservation: row!.id }, u.id);
  revalidatePath("/host/bookings/other-sites");
  redirect(`/host/bookings/other-sites/${row!.id}?msg=resadded`);
}

/**
 * SQL that sets a reservation's guest name to what a host or admin typed (`val`), marking it as typed in so calendar refreshes keep it.
 * Saving the same name again changes nothing; clearing it lets the site's calendar fill it in again.
 */
const NAME_SET = (val: string, by: string) => `guest_name_source = CASE WHEN ${val} = guest_name THEN guest_name_source WHEN ${val} = '' THEN '' ELSE 'manual' END,
  guest_name_by = CASE WHEN ${val} = guest_name THEN guest_name_by WHEN ${val} = '' THEN NULL ELSE ${by}::uuid END,
  guest_name_at = CASE WHEN ${val} = guest_name THEN guest_name_at WHEN ${val} = '' THEN NULL ELSE now() END, guest_name = ${val}`;

/**
 * Lets an authorized host or admin fill in what the other site's calendar didn't send: the guest's name and the site's booking reference.
 * Both are marked as typed in, so calendar refreshes and payout imports keep them.
 */
export async function saveStayDetailsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser(["host", "admin"]);
  const r = await manageable(u, str(fd, "id", 40));
  if (!r) return { error: "You can't manage this reservation." };
  const name = str(fd, "guest_name", 80).replace(/\s+/g, " ");
  if (name && !/\p{L}/u.test(name)) return { error: "Type the guest's name using letters." };
  const ref = str(fd, "ref", 40).toUpperCase().replace(/\s+/g, "");
  if (ref && !/^[A-Z0-9-]{4,40}$/.test(ref)) return { error: "A booking reference uses only letters, numbers and dashes, like HMABC12345 or 4512345678." };
  if (ref && await one("SELECT 1 FROM channel_reservations WHERE channel = $1 AND lower(external_ref) = lower($2) AND id <> $3", [r.channel, ref, r.id]))
    return { error: `Another ${channelLabel(r.channel)} reservation already has the reference ${ref}.` };
  await q(`UPDATE channel_reservations SET ${NAME_SET("$2", "$3")},
             ref_source = CASE WHEN $4 = external_ref THEN ref_source WHEN $4 = '' THEN '' ELSE 'manual' END, external_ref = $4, updated_at = now()
           WHERE id = $1`, [r.id, name, u.id, ref]);
  await logEvent("info", "Bookings", `Updated the guest name and reference for a ${channelLabel(r.channel)} reservation (${r.check_in} to ${r.check_out})`, { reservation: r.id }, u.id);
  revalidatePath("/host/bookings");
  revalidatePath("/host/bookings/other-sites");
  revalidatePath(`/host/bookings/other-sites/${r.id}`);
  return { ok: "Saved. These details are kept when the calendars refresh." };
}

/** Marks a calendar period from another site as a reservation or as blocked dates (for sites like Booking.com that don't say). */
export async function setKindAction(fd: FormData) {
  const u = await requireUser(["host", "admin"]);
  const r = await manageable(u, str(fd, "id", 40));
  const kind = str(fd, "kind");
  if (r && ["reservation", "blocked"].includes(kind)) await q("UPDATE channel_reservations SET kind = $2, kind_locked = true, updated_at = now() WHERE id = $1", [r.id, kind]);
  revalidatePath("/host/bookings/other-sites");
  revalidatePath("/host/bookings");
  const back = str(fd, "back", 300);
  if (back.startsWith("/host/")) redirect(back);
}

/** Cancels or reinstates a reservation entered by hand. Ones from calendar links follow the other site. */
export async function setManualStatusAction(fd: FormData) {
  const u = await requireUser(["host", "admin"]);
  const r = await manageable(u, str(fd, "id", 40));
  const status = str(fd, "status");
  if (!r || r.source === "ical" || !["confirmed", "cancelled"].includes(status)) return;
  await q("UPDATE channel_reservations SET status = $2, cancelled_at = CASE WHEN $2 = 'cancelled' THEN now() END, updated_at = now() WHERE id = $1", [r.id, status]);
  await syncManualBlock({ ...r, status }, todayLocal());
  revalidatePath(`/host/bookings/other-sites/${r.id}`);
}

export async function deleteChannelResAction(fd: FormData) {
  const u = await requireUser(["host", "admin"]);
  const r = await manageable(u, str(fd, "id", 40));
  if (!r || r.source === "ical") return;
  await q("DELETE FROM blocks WHERE source = $1", ["res:" + r.id]);
  await q("DELETE FROM channel_reservations WHERE id = $1", [r.id]);
  await logEvent("info", "Finance", `Deleted a ${channelLabel(r.channel)} reservation entered by hand (${r.check_in} to ${r.check_out})`, {}, u.id);
  redirect("/host/bookings/other-sites?msg=resdeleted");
}

export type ImportState = {
  error?: string; ok?: string; step?: "preview" | "done"; text?: string; fileName?: string; headers?: string[]; mapping?: Mapping; sample?: string[][];
  summary?: ImportSummary; skippedLines?: { line: number; reason: string }[];
  opts?: { channel: string; defaultProperty: string; markReceived: boolean };
} | null;

const MAX_BYTES = 3_000_000;

/** Payout file import: the first submit reads the file and shows what would change; the second saves it. */
export async function importPayoutAction(prev: ImportState, fd: FormData): Promise<ImportState> {
  const u = await requireUser(["host", "admin"]);
  const file = fd.get("file");
  let text = str(fd, "text", MAX_BYTES), fileName = str(fd, "file_name", 200);
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { error: "That file is over 3 MB. Export a shorter period and try again." };
    text = await file.text();
    fileName = file.name;
  }
  if (!text) return { error: "Choose the CSV file you downloaded from the booking site." };
  if (/^PK/.test(text)) return { error: "That looks like an Excel file. In Excel or Google Sheets, use File › Download / Save as › CSV, then import the CSV." };
  const rows = parseCsv(text);
  if (rows.length < 2) return { error: "The file has no rows below the header." };
  const headers = rows[0];
  const channel = str(fd, "channel", 20);
  if (!isChannel(channel) || channel === "sevgio") return { error: "Choose which site the file is from." };
  // Sent back so the choices survive the form being redrawn.
  const opts = { channel, defaultProperty: str(fd, "default_property", 40), markReceived: fd.get("mark_received") === "on" };
  // A new file gets fresh column guesses; on the second step, the person's choices are used.
  const fresh = file instanceof File && file.size > 0;
  const mapping: Mapping = fresh ? guessMapping(headers) : {};
  if (!fresh) for (const [f] of FIELDS) { const v = str(fd, "map_" + f, 4); if (v !== "" && Number(v) >= 0 && Number(v) < headers.length) mapping[f as Field] = Number(v); }
  if (mapping.ref == null && mapping.check_in == null) return { error: "Couldn't find a confirmation code or check-in date column. Check that this is a reservations or earnings export, or pick the columns below.", step: "preview", text, fileName, headers, mapping, sample: rows.slice(1, 6), opts };
  const listings = await financeListings(u);
  const def = opts.defaultProperty;
  const { records, skipped } = toRecords(rows.slice(1), mapping);
  const apply = str(fd, "mode") === "apply" && !fresh;
  const summary = await applyPayoutRecords(listings, records, {
    channel, defaultProperty: listings.some(l => l.id === def) ? def : null, markReceived: opts.markReceived, dryRun: !apply, today: todayLocal(), userId: u.id, fileName,
  });
  if (apply) {
    await logEvent("info", "Finance", `Imported ${channelLabel(channel)} payout file ${fileName}: ${summary.updated} updated, ${summary.created} added, ${summary.skipped} skipped`, {}, u.id);
    revalidatePath("/host/finance");
    return { step: "done", opts, ok: `Imported ${fileName}: ${summary.updated} reservation${summary.updated === 1 ? "" : "s"} updated, ${summary.created} added, ${summary.skipped} skipped.`, summary, skippedLines: skipped };
  }
  return { step: "preview", text, fileName, headers, mapping, sample: rows.slice(1, 6), summary, skippedLines: skipped, opts };
}

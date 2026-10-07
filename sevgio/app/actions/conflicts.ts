"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { one, q } from "@/lib/db.ts";
import { requireUser } from "@/lib/auth.ts";
import { requireManageable } from "@/lib/access.ts";
import { str, type ActionState } from "@/lib/validate.ts";
import { logEvent } from "@/lib/log.ts";
import { checkConflicts, getConflict } from "@/lib/conflicts.ts";
import { RESOLUTIONS } from "@/lib/conflict-core.ts";
import { pushToUsers } from "@/lib/push.ts";


function revalidate() {
  revalidatePath("/host/conflicts", "layout");
  revalidatePath("/admin/conflicts", "layout");
}

/** Marks a double booking as reviewed and handled. Neither reservation is changed or cancelled. */
export async function resolveConflictAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser(["host", "admin"]);
  const c = await getConflict(u, str(fd, "id", 40));
  if (!c) return { error: "You can't manage this conflict." };
  const resolution = str(fd, "resolution", 20), note = str(fd, "note", 1000);
  if (!RESOLUTIONS.some(r => r[0] === resolution)) return { error: "Choose how the conflict was handled." };
  if (resolution === "other" && note.length < 3) return { error: "Add a short note saying what was done." };
  const r = await one("UPDATE booking_conflicts SET status = 'resolved', resolved_at = now(), resolved_by = $2, resolution = $3, resolution_note = $4 WHERE id = $1 AND status = 'open' RETURNING id",
    [c.id, u.id, resolution, note]);
  if (!r) return { error: "This conflict was already resolved." };
  await logEvent("info", "Double bookings", `Conflict marked resolved: ${RESOLUTIONS.find(x => x[0] === resolution)![1]}`, { conflict: c.id, note }, u.id);
  revalidate();
  return { ok: "Marked as resolved. Both reservations are unchanged." };
}

export async function reopenConflictAction(fd: FormData) {
  const u = await requireUser(["host", "admin"]);
  const c = await getConflict(u, str(fd, "id", 40));
  if (!c) return;
  await q("UPDATE booking_conflicts SET status = 'open', resolved_at = NULL, resolved_by = NULL, resolution = '', resolution_note = '' WHERE id = $1", [c.id]);
  await logEvent("info", "Double bookings", "Conflict reopened", { conflict: c.id }, u.id);
  revalidate();
}

/** Runs the double-booking check now (the site also does it after every calendar refresh). */
export async function checkConflictsNowAction(_: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  await requireUser(["host", "admin"]);
  const r = await checkConflicts();
  revalidate();
  if (!r) return { error: "The check couldn't run. The error is in the Operations log." };
  return { ok: r.found ? `Checked. ${r.found} conflict${r.found === 1 ? "" : "s"} found${r.opened ? `, ${r.opened} new` : ""}.` : "Checked. No double bookings found." };
}

/** Hours a listing needs between one guest leaving and the next arriving. */
export async function setTurnaroundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { u, p } = await requireManageable(str(fd, "property", 40));
  const hours = Number(str(fd, "hours", 4));
  if (!Number.isInteger(hours) || hours < 0 || hours > 72) return { error: "Choose a turnover time." };
  await q("UPDATE properties SET turnaround_hours = $2, updated_at = now() WHERE id = $1", [p.id, hours]);
  await logEvent("info", "Double bookings", `Turnover time for ${p.title} set to ${hours} hours`, { property: p.id }, u.id);
  after(checkConflicts);
  revalidate();
  return { ok: `Saved for ${p.title}.` };
}

// ---------- Phone and computer alerts (web push) ----------

type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function savePushSubscriptionAction(json: string, device: string): Promise<{ ok: boolean }> {
  const u = await requireUser(["host", "admin"]);
  let s: Sub;
  try { s = JSON.parse(json); } catch { return { ok: false }; }
  if (!s.endpoint?.startsWith("https://") || !s.keys?.p256dh || !s.keys.auth || s.endpoint.length > 2000) return { ok: false };
  await q(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, device) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, device = EXCLUDED.device, last_error = ''`,
    [u.id, s.endpoint, s.keys.p256dh, s.keys.auth, device.slice(0, 120)]);
  await logEvent("info", "Double bookings", "Turned on phone alerts on a device", { device: device.slice(0, 120) }, u.id);
  revalidate();
  return { ok: true };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<{ ok: boolean }> {
  const u = await requireUser(["host", "admin"]);
  await q("DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2", [endpoint, u.id]);
  revalidate();
  return { ok: true };
}

export async function testPushAction(): Promise<{ ok: boolean; text: string }> {
  const u = await requireUser(["host", "admin"]);
  const r = await pushToUsers([u.id], { title: "Sevgio alerts are on", body: "You'll get a notification like this the moment a double booking is found.", url: u.role === "admin" ? "/admin/conflicts" : "/host/conflicts", tag: "test" });
  if (!r.devices) return { ok: false, text: "No device has alerts turned on yet." };
  return { ok: r.sent > 0, text: r.sent ? `Test sent to ${r.sent} device${r.sent === 1 ? "" : "s"}.` : "The test couldn't be delivered. Turn alerts off and on again on this device." };
}

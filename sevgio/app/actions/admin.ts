"use server";
import { revalidatePath } from "next/cache";
import { one, q } from "@/lib/db.ts";
import nodeCrypto from "node:crypto";
import { hashPassword, requireUser, sha256 } from "@/lib/auth.ts";
import { ROLES } from "@/lib/constants.ts";
import { saveSetting } from "@/lib/settings.ts";
import { isEmail, str, type ActionState } from "@/lib/validate.ts";
import { toCents } from "@/lib/money.ts";
import { logEvent } from "@/lib/log.ts";
import { sendEmail, siteUrl } from "@/lib/email.ts";
import { processPhoto } from "@/lib/photos.ts";
import { SECTIONS, slugOf } from "@/lib/guide.ts";

const GUIDE_SLUGS = new Set(SECTIONS.flatMap(s => s.places.map(p => slugOf(p.name))));

export async function setRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser(["admin"]);
  const id = str(fd, "id", 40), role = str(fd, "role") as (typeof ROLES)[number];
  if (!ROLES.includes(role)) return { error: "Choose a valid role." };
  if (id === admin.id) return { error: "You can't change your own role. Ask another admin." };
  const u = await one<{ email: string; role: string }>("SELECT email, role FROM users WHERE id = $1", [id]);
  if (!u) return { error: "User not found." };
  if (u.role === "host" && role !== "host" && role !== "admin") {
    const owns = await one<{ n: number }>("SELECT count(*) AS n FROM properties WHERE host_id = $1", [id]);
    if (owns && owns.n > 0) return { error: `This host still manages ${owns.n} listing${owns.n > 1 ? "s" : ""}. Reassign them first.` };
  }
  await q("UPDATE users SET role = $2 WHERE id = $1", [id, role]);
  if (role !== u.role) await q("DELETE FROM sessions WHERE user_id = $1", [id]); // new permissions apply at next sign-in
  await logEvent("info", "Access", `Role for ${u.email} changed from ${u.role} to ${role}`, {}, admin.id);
  revalidatePath("/admin/users");
  return { ok: `${u.email} is now ${role === "admin" ? "an admin" : "a " + role}.` };
}

export async function setDisabledAction(fd: FormData) {
  const admin = await requireUser(["admin"]);
  const id = str(fd, "id", 40), disabled = str(fd, "disabled") === "1";
  if (id === admin.id) return;
  const u = await one<{ email: string }>("UPDATE users SET disabled = $2 WHERE id = $1 RETURNING email", [id, disabled]);
  if (disabled) await q("DELETE FROM sessions WHERE user_id = $1", [id]);
  if (u) await logEvent("warn", "Access", `${u.email} was ${disabled ? "turned off" : "turned back on"}`, {}, admin.id);
  revalidatePath("/admin/users");
}

export async function inviteUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser(["admin"]);
  const name = str(fd, "name", 120), email = str(fd, "email", 254).toLowerCase(), role = str(fd, "role") as (typeof ROLES)[number];
  if (!name) return { error: "Add the person's name." };
  if (!isEmail(email)) return { error: "Enter a valid email address." };
  if (!ROLES.includes(role)) return { error: "Choose a role." };
  if (await one("SELECT 1 FROM users WHERE lower(email) = $1", [email])) return { error: "Someone already has an account with this email. Change their role in the list instead." };
  // Random password they never see; they set their own with the reset link.
  const u = await one<{ id: string }>("INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id", [email, name, role, await hashPassword(nodeCrypto.randomBytes(32).toString("hex"))]);
  const token = nodeCrypto.randomBytes(32).toString("base64url");
  await q("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')", [sha256(token), u!.id]);
  await sendEmail(email, "You're invited to Sevgio Stays", `Hi ${name.split(" ")[0]},\n\n${admin.name} has created a Sevgio Stays ${role} account for you. Choose your password here (the link works for 7 days):\n${siteUrl()}/reset/${token}`);
  await logEvent("info", "Access", `Invited ${email} as ${role}`, {}, admin.id);
  revalidatePath("/admin/users");
  return { ok: `Invitation sent to ${email}.` };
}

export async function reassignListingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser(["admin"]);
  const id = str(fd, "id", 40), hostId = str(fd, "host_id", 40);
  const h = await one<{ name: string }>("SELECT name FROM users WHERE id = $1 AND role IN ('host','admin') AND NOT disabled", [hostId]);
  if (!h) return { error: "Choose an active host." };
  const p = await one<{ title: string }>("UPDATE properties SET host_id = $2, updated_at = now() WHERE id = $1 RETURNING title", [id, hostId]);
  if (!p) return { error: "Listing not found." };
  await logEvent("info", "Listings", `${p.title} reassigned to ${h.name}`, {}, admin.id);
  revalidatePath("/admin/listings");
  return { ok: `${p.title} is now managed by ${h.name}.` };
}

export async function setListingStatusAction(fd: FormData) {
  const admin = await requireUser(["admin"]);
  const id = str(fd, "id", 40), status = str(fd, "status");
  if (!["published", "hidden", "draft"].includes(status)) return;
  if (status === "published") {
    const ph = await one<{ n: number }>("SELECT count(*) AS n FROM photos WHERE property_id = $1", [id]);
    if (!ph || ph.n === 0) return;
  }
  const p = await one<{ title: string }>("UPDATE properties SET status = $2, updated_at = now() WHERE id = $1 RETURNING title", [id, status]);
  if (p) await logEvent("info", "Listings", `${p.title} set to ${status} by admin`, {}, admin.id);
  revalidatePath("/admin/listings");
}

export async function setRatingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser(["admin"]);
  const id = str(fd, "id", 40), ratingRaw = str(fd, "rating"), count = Number(str(fd, "review_count") || 0);
  const rating = ratingRaw === "" ? null : Number(ratingRaw);
  if (rating !== null && !(rating >= 1 && rating <= 5)) return { error: "Rating must be between 1 and 5, or empty." };
  if (!(Number.isInteger(count) && count >= 0)) return { error: "Review count must be a whole number." };
  await q("UPDATE properties SET rating = $2, review_count = $3 WHERE id = $1", [id, rating, count]);
  revalidatePath("/admin/listings");
  return { ok: "Rating saved." };
}

export async function resolveEventAction(fd: FormData) {
  await requireUser(["admin"]);
  const id = Number(str(fd, "id")), resolved = str(fd, "resolved") === "1";
  await q("UPDATE event_log SET resolved_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id = $1", [id, resolved]);
  revalidatePath("/admin/log");
  revalidatePath("/admin");
}

export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireUser(["admin"]);
  const tax = Number(str(fd, "tax_percent") || 0);
  if (!(tax >= 0 && tax <= 30)) return { error: "Tax must be between 0% and 30%." };
  const email = str(fd, "contact_email", 254);
  if (email && !isEmail(email)) return { error: "Enter a valid contact email, or leave it empty." };
  await saveSetting("tax_percent", Math.round(tax * 100) / 100);
  await saveSetting("contact_email", email);
  await saveSetting("contact_phone", str(fd, "contact_phone", 40));
  await saveSetting("payment_note", str(fd, "payment_note", 300));
  await saveSetting("site_notice", str(fd, "site_notice", 300));
  // Payments
  const feePct = Number(str(fd, "card_fee_percent") || 0), feeFixed = toCents(str(fd, "card_fee_fixed") || "0");
  const deposit = Number(str(fd, "deposit_percent") || 0), hours = Number(str(fd, "manual_payment_hours") || 24);
  if (!(feePct >= 0 && feePct <= 4)) return { error: "Card fee must be between 0% and 4%." };
  if (feeFixed === null || feeFixed > 100) return { error: "Card fixed fee must be between $0 and $1." };
  if (!(deposit >= 0 && deposit <= 100)) return { error: "Deposit must be between 0% and 100%." };
  if (!(Number.isInteger(hours) && hours >= 1 && hours <= 72)) return { error: "Time to pay by Zelle/Venmo must be 1 to 72 hours." };
  const zelle = str(fd, "zelle_to", 120), venmo = str(fd, "venmo_handle", 60);
  const on = (k: string) => fd.get(k) === "on";
  if (on("pay_zelle") && !zelle) return { error: "Add the email or phone number guests should send Zelle payments to." };
  if (on("pay_venmo") && !venmo) return { error: "Add your Venmo username (like @Sevgio-Stays)." };
  if (on("pay_cash") && !zelle && !venmo) return { error: "Cash at arrival needs Zelle or Venmo for the deposit. Add at least one." };
  for (const k of ["pay_card", "pay_ach", "pay_zelle", "pay_venmo", "pay_cash"] as const) await saveSetting(k, on(k));
  await saveSetting("card_fee_percent", feePct);
  await saveSetting("card_fee_fixed_cents", feeFixed);
  await saveSetting("deposit_percent", deposit);
  await saveSetting("manual_payment_hours", hours);
  await saveSetting("zelle_to", zelle);
  await saveSetting("venmo_handle", venmo);
  await logEvent("info", "Settings", "Site settings updated", { tax }, admin.id);
  revalidatePath("/", "layout");
  return { ok: "Settings saved. New prices apply to new bookings only." };
}

// ---------- Home page slideshow ----------

export async function uploadSlideAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser(["admin"]);
  const files = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose a photo to upload." };
  const errors: string[] = [];
  let added = 0;
  for (const f of files.slice(0, 30)) {
    const r = await processPhoto(f);
    if ("error" in r) { errors.push(r.error); continue; }
    await q("INSERT INTO site_photos (position, large, thumb, width, height) VALUES ((SELECT coalesce(max(position), -1) + 1 FROM site_photos WHERE slot IS NULL), $1, $2, $3, $4)", [r.large, r.thumb, r.width, r.height]);
    added++;
  }
  revalidatePath("/admin/settings");
  revalidatePath("/");
  if (errors.length) return { error: `${added} photo${added === 1 ? "" : "s"} added. ${errors.join(" ")}` };
  return { ok: `${added} photo${added === 1 ? "" : "s"} added.` };
}

export async function slideCommandAction(fd: FormData) {
  await requireUser(["admin"]);
  const id = str(fd, "photo", 40), cmd = str(fd, "cmd", 20);
  const rows = await q<{ id: string }>("SELECT id FROM site_photos WHERE slot IS NULL ORDER BY position, created_at");
  const i = rows.findIndex(r => r.id === id);
  if (i < 0) return;
  if (cmd === "caption") await q("UPDATE site_photos SET caption = $2 WHERE id = $1", [id, str(fd, "caption", 120)]);
  const order = rows.map(r => r.id);
  if (cmd === "delete") { order.splice(i, 1); await q("DELETE FROM site_photos WHERE id = $1", [id]); }
  if (cmd === "up" && i > 0) [order[i - 1], order[i]] = [order[i], order[i - 1]];
  if (cmd === "down" && i < order.length - 1) [order[i + 1], order[i]] = [order[i], order[i + 1]];
  for (const [n, pid] of order.entries()) await q("UPDATE site_photos SET position = $2 WHERE id = $1", [pid, n]);
  revalidatePath("/admin/settings");
  revalidatePath("/");
}

// ---------- Email check ----------

/** Sends a test email to the signed-in admin and explains any problem in plain words. */
export async function testEmailAction(_: ActionState, _fd: FormData): Promise<ActionState> {
  const u = await requireUser(["admin"]);
  const r = await sendEmail(u.email, "Sevgio Stays test email", "It works! Your website can send emails: verification codes, booking confirmations and new-booking alerts.", { force: true });
  if (r.ok) return { ok: `Test email sent to ${u.email}. Check your inbox (and the Spam folder).` };
  if (r.error === "not-configured") return { error: "Email isn't set up yet. Add SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in Render → Environment (see the steps in the README), then try again." };
  if (/535|Username and Password not accepted|Invalid login|BadCredentials/i.test(r.error || "")) return { error: "Gmail refused the login. Check SMTP_USER is your full Gmail address and SMTP_PASS is the 16-letter App Password (not your normal Gmail password)." };
  if (/timeout|ETIMEDOUT|ECONNREFUSED|ENETUNREACH/i.test(r.error || "")) return { error: "The website couldn't reach Gmail (connection timeout). Render's free plan blocks sending email. Change the sevgio web service's Instance Type to Starter in Render → sevgio → Settings, then try again." };
  return { error: `The email couldn't be sent: ${(r.error || "").slice(0, 200)}` };
}

/** Confirms a guest's email by hand, e.g. when you've spoken to them on the phone. */
export async function confirmEmailAction(fd: FormData) {
  const admin = await requireUser(["admin"]);
  const id = str(fd, "id", 40);
  const u = await one<{ email: string }>("UPDATE users SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL RETURNING email", [id]);
  if (u) await logEvent("info", "Accounts", `Email confirmed by an admin: ${u.email}`, {}, admin.id);
  revalidatePath("/admin/users");
}

// ---------- Pittsburgh guide photos ----------

/** Sets (or replaces) the photo for one place in the Pittsburgh guide. The uploader sends the place's slug as "id". */
export async function uploadGuidePhotoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser(["admin"]);
  const slot = str(fd, "id", 80);
  if (!GUIDE_SLUGS.has(slot)) return { error: "Unknown place." };
  const file = fd.getAll("photos").find((f): f is File => f instanceof File && f.size > 0);
  if (!file) return { error: "Choose a photo to upload." };
  const r = await processPhoto(file);
  if ("error" in r) return { error: r.error };
  await q("DELETE FROM site_photos WHERE slot = $1", [slot]);
  await q("INSERT INTO site_photos (slot, large, thumb, width, height) VALUES ($1, $2, $3, $4, $5)", [slot, r.large, r.thumb, r.width, r.height]);
  revalidatePath("/admin/guide");
  revalidatePath("/pittsburgh");
  return { ok: "Photo added." };
}

export async function removeGuidePhotoAction(fd: FormData) {
  await requireUser(["admin"]);
  await q("DELETE FROM site_photos WHERE slot = $1", [str(fd, "slot", 80)]);
  revalidatePath("/admin/guide");
  revalidatePath("/pittsburgh");
}

/** Approves someone who chose "List my home" at sign-up: they become a host and get an email. */
export async function approveHostAction(fd: FormData) {
  const admin = await requireUser(["admin"]);
  const id = str(fd, "id", 40), decision = str(fd, "decision", 10);
  const u = await one<{ email: string; name: string; role: string }>("SELECT email, name, role FROM users WHERE id = $1 AND host_requested_at IS NOT NULL", [id]);
  if (!u) return;
  if (decision === "approve") {
    await q("UPDATE users SET role = CASE WHEN role = 'customer' THEN 'host' ELSE role END, host_requested_at = NULL WHERE id = $1", [id]);
    await q("DELETE FROM sessions WHERE user_id = $1", [id]); // host tools appear at next sign-in
    await sendEmail(u.email, "You're a Sevgio Stays host", `Hi ${u.name.split(" ")[0]},\n\nYour host account is ready. Sign in and open your host dashboard to add your first listing: ${siteUrl()}/host`);
    await logEvent("info", "Access", `${u.email} approved as a host`, {}, admin.id);
  } else {
    await q("UPDATE users SET host_requested_at = NULL WHERE id = $1", [id]);
    await logEvent("info", "Access", `Host request from ${u.email} declined`, {}, admin.id);
  }
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

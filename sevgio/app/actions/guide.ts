"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { one, q, tx } from "@/lib/db.ts";
import { requireUser } from "@/lib/auth.ts";
import { str, type ActionState } from "@/lib/validate.ts";
import { isIsoDate } from "@/lib/dates.ts";
import { logEvent } from "@/lib/log.ts";
import { processPhoto } from "@/lib/photos.ts";
import { SECTION_IDS, type PlaceFields } from "@/lib/guide-places.ts";

const UUID = /^[0-9a-f-]{36}$/i;
const refresh = () => { revalidatePath("/pittsburgh"); revalidatePath("/admin/guide"); };
const admin = () => requireUser(["admin"], "/admin/guide");
/** A page address with a message to show at the top (for actions that move to another page). */
const withMsg = (path: string, msg: string) => { const [p, hash] = path.split("#"); return `${p}${p.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}${hash ? "#" + hash : ""}`; };

/** Reads and checks the place form. Returns the fields, or an error to show. */
function readPlace(fd: FormData): { fields: PlaceFields } | { error: string } {
  let website = str(fd, "website", 300);
  if (website && !/^https?:\/\//i.test(website)) website = "https://" + website;
  const f: PlaceFields = {
    section: str(fd, "section") as PlaceFields["section"],
    name: str(fd, "name", 120), area: str(fd, "area", 80), description: str(fd, "description", 400), icon: str(fd, "icon", 8) || "📍",
    address: str(fd, "address", 200), map_query: str(fd, "map_query", 120), website, phone: str(fd, "phone", 40),
    sponsored: fd.get("sponsored") === "on", sponsor_start: str(fd, "sponsor_start") || null, sponsor_end: str(fd, "sponsor_end") || null,
  };
  if (!f.name) return { error: "Add the place's name." };
  if (!SECTION_IDS.includes(f.section)) return { error: "Choose a category." };
  if (website) { try { const u = new URL(website); if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw 0; } catch { return { error: "The website doesn't look right. Example: https://www.primantibros.com" }; } }
  if (f.phone && !/^[0-9+().\-\s]{7,}$/.test(f.phone)) return { error: "The phone number doesn't look right. Example: (412) 555-0100" };
  if ((f.sponsor_start && !isIsoDate(f.sponsor_start)) || (f.sponsor_end && !isIsoDate(f.sponsor_end))) return { error: "Check the sponsorship dates." };
  if (f.sponsor_start && f.sponsor_end && f.sponsor_end < f.sponsor_start) return { error: "The sponsorship can't end before it starts." };
  return { fields: f };
}

/** Saves a place. "Save draft" keeps the changes private (see them in Preview); "Publish" puts them on the guide. */
export async function savePlaceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await admin();
  const r = readPlace(fd);
  if ("error" in r) return r;
  const f = r.fields;
  const publish = str(fd, "mode") === "publish";
  const id = str(fd, "id", 40);
  if (!id) {
    const row = await one<{ id: string }>(
      `INSERT INTO guide_places (section, position, status, name, area, description, icon, address, map_query, website, phone, sponsored, sponsor_start, sponsor_end)
       VALUES ($1, coalesce((SELECT max(position) + 1 FROM guide_places WHERE section = $1), 0), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [f.section, publish ? "published" : "draft", f.name, f.area, f.description, f.icon, f.address, f.map_query, f.website, f.phone, f.sponsored, f.sponsor_start, f.sponsor_end]);
    await logEvent("info", "Guide", `Guide place added${publish ? " and published" : " as a draft"}: ${f.name}`, {}, u.id);
    refresh();
    redirect(withMsg(`/admin/guide/${row!.id}`, publish ? "Added and published. It's on the Pittsburgh guide now." : "Saved as a draft. Add photos, preview it, then publish."));
  }
  if (!UUID.test(id)) return { error: "Unknown place." };
  const cur = await one<{ section: string; status: string }>("SELECT section, status FROM guide_places WHERE id = $1", [id]);
  if (!cur) return { error: "That place no longer exists." };
  if (!publish && cur.status === "published") {
    await q("UPDATE guide_places SET draft = $2, updated_at = now() WHERE id = $1", [id, JSON.stringify(f)]);
    refresh();
    return { ok: "Changes saved as a draft. Visitors still see the published version. Preview, then Publish when ready." };
  }
  // Publishing (or editing something not yet public): write the fields; a new category puts it at the end of that category.
  await q(
    `UPDATE guide_places SET section = $2, name = $3, area = $4, description = $5, icon = $6, address = $7, map_query = $8, website = $9, phone = $10,
       sponsored = $11, sponsor_start = $12, sponsor_end = $13, draft = NULL, updated_at = now(),
       status = CASE WHEN $14 THEN 'published' ELSE status END,
       position = CASE WHEN section = $2 THEN position ELSE coalesce((SELECT max(position) + 1 FROM guide_places WHERE section = $2), 0) END
     WHERE id = $1`,
    [id, f.section, f.name, f.area, f.description, f.icon, f.address, f.map_query, f.website, f.phone, f.sponsored, f.sponsor_start, f.sponsor_end, publish]);
  await logEvent("info", "Guide", `Guide place ${publish ? "published" : "saved"}: ${f.name}`, { sponsored: f.sponsored, sponsor_end: f.sponsor_end }, u.id);
  refresh();
  return { ok: publish ? "Published. The Pittsburgh guide shows these changes now." : "Saved. It isn't on the guide until you publish it." };
}

/** Throws away unpublished changes to a published place. */
export async function discardDraftAction(fd: FormData) {
  await admin();
  const id = str(fd, "id", 40);
  if (UUID.test(id)) await q("UPDATE guide_places SET draft = NULL WHERE id = $1", [id]);
  refresh();
  redirect(withMsg(`/admin/guide/${id}`, "Unpublished changes discarded."));
}

/** Publishes (shows) or hides a place, applying any saved draft when publishing. */
export async function setPlaceStatusAction(fd: FormData) {
  const u = await admin();
  const id = str(fd, "id", 40), status = str(fd, "status");
  if (!UUID.test(id) || !["published", "hidden"].includes(status)) return;
  const p = await one<{ name: string; draft: Partial<PlaceFields> | null }>("SELECT name, draft FROM guide_places WHERE id = $1", [id]);
  if (!p) return;
  if (status === "published" && p.draft) {
    const d = p.draft;
    await q(`UPDATE guide_places SET section = coalesce($2, section), name = coalesce($3, name), area = coalesce($4, area), description = coalesce($5, description), icon = coalesce($6, icon),
               address = coalesce($7, address), map_query = coalesce($8, map_query), website = coalesce($9, website), phone = coalesce($10, phone),
               sponsored = coalesce($11, sponsored), sponsor_start = $12, sponsor_end = $13, draft = NULL WHERE id = $1`,
      [id, d.section ?? null, d.name ?? null, d.area ?? null, d.description ?? null, d.icon ?? null, d.address ?? null, d.map_query ?? null, d.website ?? null, d.phone ?? null, d.sponsored ?? null, d.sponsor_start ?? null, d.sponsor_end ?? null]);
  }
  await q("UPDATE guide_places SET status = $2, updated_at = now() WHERE id = $1", [id, status]);
  await logEvent("info", "Guide", `Guide place ${status === "published" ? "published" : "hidden"}: ${p.name}`, {}, u.id);
  refresh();
  const back = str(fd, "back", 200);
  redirect(withMsg(back.startsWith("/admin/guide") ? back : "/admin/guide", status === "published" ? `“${p.name}” is on the guide.` : `“${p.name}” is hidden from visitors.`));
}

/** Deletes a place and its photos. */
export async function deletePlaceAction(fd: FormData) {
  const u = await admin();
  const id = str(fd, "id", 40);
  if (!UUID.test(id)) return;
  const p = await one<{ name: string }>("DELETE FROM guide_places WHERE id = $1 RETURNING name", [id]);
  await q("DELETE FROM site_photos WHERE slot = $1", ["place:" + id]);
  if (p) await logEvent("warn", "Guide", `Guide place deleted: ${p.name}`, {}, u.id);
  refresh();
  redirect(withMsg("/admin/guide", p ? `“${p.name}” was deleted.` : "Already deleted."));
}

/** Moves a place up or down within its category, or to the top. The first four show before "See more". */
export async function movePlaceAction(fd: FormData) {
  await admin();
  const id = str(fd, "id", 40), dir = str(fd, "dir");
  if (!UUID.test(id) || !["up", "down", "top"].includes(dir)) return;
  await tx(async c => {
    const me = (await q<{ section: string }>("SELECT section FROM guide_places WHERE id = $1 FOR UPDATE", [id], c))[0];
    if (!me) return;
    const list = (await q<{ id: string }>("SELECT id FROM guide_places WHERE section = $1 ORDER BY position, created_at FOR UPDATE", [me.section], c)).map(r => r.id);
    const i = list.indexOf(id);
    list.splice(i, 1);
    list.splice(dir === "top" ? 0 : Math.max(0, Math.min(list.length, i + (dir === "up" ? -1 : 1))), 0, id);
    for (const [pos, pid] of list.entries()) await q("UPDATE guide_places SET position = $2 WHERE id = $1", [pid, pos], c);
  });
  refresh();
  redirect(`/admin/guide#place-${id}`);
}

/** Adds a photo to a place (the uploader sends the place id as "id"). The first photo is the one the guide shows. */
export async function uploadPlacePhotoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await admin();
  const id = str(fd, "id", 40);
  if (!UUID.test(id) || !(await one("SELECT 1 FROM guide_places WHERE id = $1", [id]))) return { error: "Unknown place." };
  const files = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 10);
  if (!files.length) return { error: "Choose a photo to upload." };
  let added = 0;
  for (const file of files) {
    const r = await processPhoto(file);
    if ("error" in r) return { error: r.error };
    await q(`INSERT INTO site_photos (slot, position, large, thumb, width, height)
             VALUES ($1, coalesce((SELECT max(position) + 1 FROM site_photos WHERE slot = $1), 0), $2, $3, $4, $5)`, ["place:" + id, r.large, r.thumb, r.width, r.height]);
    added++;
  }
  refresh();
  return { ok: `${added} photo${added === 1 ? "" : "s"} added.` };
}

/** Removes a photo from a place, or makes it the one shown first. */
export async function placePhotoAction(fd: FormData) {
  await admin();
  const photo = str(fd, "photo", 40), place = str(fd, "place", 40), what = str(fd, "what");
  if (!UUID.test(photo) || !UUID.test(place)) return;
  if (what === "remove") await q("DELETE FROM site_photos WHERE id = $1 AND slot = $2", [photo, "place:" + place]);
  if (what === "cover") await q("UPDATE site_photos SET position = CASE WHEN id = $1 THEN -1 ELSE position + 1 END WHERE slot = $2", [photo, "place:" + place]);
  refresh();
  redirect(`/admin/guide/${place}#photos`);
}

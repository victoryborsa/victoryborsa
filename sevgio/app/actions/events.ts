"use server";
import { revalidatePath } from "next/cache";
import { one, q } from "@/lib/db.ts";
import { requireUser } from "@/lib/auth.ts";
import { isIsoDate } from "@/lib/dates.ts";
import { processPhoto } from "@/lib/photos.ts";
import { logEvent } from "@/lib/log.ts";
import { str, type ActionState } from "@/lib/validate.ts";
import { CATEGORIES, syncAllEvents, syncEventFeed, teamOf } from "@/lib/events.ts";

const done = () => { revalidatePath("/admin/events"); revalidatePath("/events"); };

export async function syncEventsAction(_: ActionState, _fd: FormData): Promise<ActionState> {
  await requireUser(["admin"]);
  const r = await syncAllEvents(true);
  done();
  if ("skipped" in r) return { ok: "Already up to date." };
  if (r.ticketmasterError === "not-configured") return { ok: `Ticketmaster isn't connected yet (add TICKETMASTER_API_KEY in Render). Calendar links: ${r.feedEvents} events from ${r.feeds} link${r.feeds === 1 ? "" : "s"}.` };
  if (r.ticketmasterError) return { error: `Ticketmaster: ${r.ticketmasterError}. Calendar links: ${r.feedEvents} events.` };
  return { ok: `Updated: ${r.ticketmaster} events from Ticketmaster and ${r.feedEvents} from ${r.feeds} calendar link${r.feeds === 1 ? "" : "s"}.` };
}

export async function addEventAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser(["admin"]);
  const title = str(fd, "title", 200), date = str(fd, "date", 10), end = str(fd, "end_date", 10), time = str(fd, "time", 5);
  const venue = str(fd, "venue", 120), category = str(fd, "category", 40), url = str(fd, "url", 500), imageUrl = str(fd, "image_url", 500);
  if (!title) return { error: "Add the event name." };
  if (!isIsoDate(date)) return { error: "Choose the event date." };
  if (end && (!isIsoDate(end) || end < date)) return { error: "The last day must be on or after the first day." };
  if (time && !/^\d{2}:\d{2}$/.test(time)) return { error: "Choose a start time, or leave it empty for all-day events." };
  if (!CATEGORIES.includes(category)) return { error: "Choose a type of event." };
  for (const [v, label] of [[url, "event link"], [imageUrl, "picture link"]] as const) if (v && !/^https:\/\//.test(v)) return { error: `The ${label} must start with https://` };
  const file = fd.get("photo");
  const photo = file instanceof File && file.size > 0 ? await processPhoto(file) : null;
  if (photo && "error" in photo) return { error: photo.error };
  const ev = await one<{ id: string }>(
    `INSERT INTO events (source, title, local_date, end_date, local_time, venue, category, team, image_url, url, featured, free)
     VALUES ('manual', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [title, date, end && end > date ? end : null, time, venue, category, teamOf(title), imageUrl, url, fd.get("featured") === "on", fd.get("free") === "on"],
  );
  if (photo && !("error" in photo)) await q("INSERT INTO site_photos (slot, large, thumb, width, height) VALUES ($1, $2, $3, $4, $5)", [`event:${ev!.id}`, photo.large, photo.thumb, photo.width, photo.height]);
  await logEvent("info", "Events", `Added event: ${title} (${date})`, {}, u.id);
  done();
  return { ok: `Added "${title}".` };
}

export async function eventCommandAction(fd: FormData) {
  await requireUser(["admin"]);
  const id = str(fd, "id", 40), cmd = str(fd, "cmd", 20);
  if (cmd === "feature") await q("UPDATE events SET featured = NOT featured WHERE id = $1", [id]);
  if (cmd === "free") await q("UPDATE events SET free = NOT free WHERE id = $1", [id]);
  if (cmd === "hide") await q("UPDATE events SET hidden = NOT hidden WHERE id = $1", [id]);
  if (cmd === "delete") {
    await q("DELETE FROM events WHERE id = $1 AND source = 'manual'", [id]);
    await q("DELETE FROM site_photos WHERE slot = $1", [`event:${id}`]);
  }
  done();
}

export async function addEventFeedAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser(["admin"]);
  const name = str(fd, "name", 80), url = str(fd, "url", 500).replace(/^webcal:\/\//i, "https://"), category = str(fd, "category", 40);
  if (!name) return { error: "Give the calendar a name, like \"Pirates schedule\"." };
  if (!/^https:\/\//.test(url)) return { error: "Paste the calendar link (it starts with https:// or webcal://)." };
  if (!CATEGORIES.includes(category)) return { error: "Choose a type of event." };
  const f = await one<{ id: string }>("INSERT INTO event_feeds (name, url, category) VALUES ($1, $2, $3) RETURNING id", [name, url, category]);
  const r = await syncEventFeed(f!.id);
  done();
  return r.error ? { error: `Saved, but the calendar couldn't be read: ${r.error}` } : { ok: `Added ${name}: ${r.count} upcoming events.` };
}

export async function removeEventFeedAction(fd: FormData) {
  await requireUser(["admin"]);
  await q("DELETE FROM event_feeds WHERE id = $1", [str(fd, "id", 40)]);
  done();
}

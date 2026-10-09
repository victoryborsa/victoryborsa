"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth.ts";
import { str } from "@/lib/validate.ts";
import { syncFeed } from "@/lib/calendar-sync.ts";
import { checkConflicts } from "@/lib/conflicts.ts";
import { syncHealth } from "@/lib/sync-health.ts";

/** Sync now: one calendar link, or every link this person manages. One failing link never stops the others. */
export async function syncNowAction(fd: FormData) {
  const u = await requireUser(["host", "admin"]);
  const which = str(fd, "feed", 40), back = str(fd, "back", 100) === "/admin/calendar-sync" ? "/admin/calendar-sync" : "/host/calendar-sync";
  const feeds = (await syncHealth(u)).filter(f => which === "all" || f.id === which);
  let failed = 0;
  for (const f of feeds) if ((await syncFeed(f.id, { checkAfter: false })).error) failed++;
  if (feeds.length) await checkConflicts();
  revalidatePath("/", "layout");
  redirect(`${back}?synced=${feeds.length}&failed=${failed}`);
}

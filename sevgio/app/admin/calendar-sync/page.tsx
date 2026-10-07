import { requireUser } from "@/lib/auth.ts";
import { CalendarSync } from "@/components/CalendarSync.tsx";

export default async function CalendarSyncPage({ searchParams }: { searchParams: Promise<{ synced?: string; failed?: string }> }) {
  const u = await requireUser(["admin"], "/admin/calendar-sync");
  const sp = await searchParams;
  return <CalendarSync u={u} base="/admin" synced={sp.synced} failed={sp.failed} />;
}

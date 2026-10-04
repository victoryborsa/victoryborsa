import { requireUser } from "@/lib/auth.ts";
import { MultiCalendar, type CalParams } from "@/components/MultiCalendar.tsx";

export default async function AdminCalendar({ searchParams }: { searchParams: Promise<CalParams> }) {
  const u = await requireUser(["admin"], "/admin/calendar");
  return <MultiCalendar u={u} basePath="/admin/calendar" sp={await searchParams} />;
}

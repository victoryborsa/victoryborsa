import { requireUser } from "@/lib/auth.ts";
import { MultiCalendar, type CalParams } from "@/components/MultiCalendar.tsx";

export default async function HostCalendar({ searchParams }: { searchParams: Promise<CalParams> }) {
  const u = await requireUser(["host", "admin"], "/host/calendar");
  return <MultiCalendar u={u} basePath="/host/calendar" sp={await searchParams} />;
}

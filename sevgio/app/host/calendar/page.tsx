import { requireUser } from "@/lib/auth.ts";
import { MultiCalendar } from "@/components/MultiCalendar.tsx";

export default async function HostCalendar({ searchParams }: { searchParams: Promise<{ start?: string; days?: string; property?: string }> }) {
  const u = await requireUser(["host", "admin"], "/host/calendar");
  return <MultiCalendar u={u} basePath="/host/calendar" sp={await searchParams} />;
}

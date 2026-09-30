import { requireUser } from "@/lib/auth.ts";
import { MultiCalendar } from "@/components/MultiCalendar.tsx";

export default async function AdminCalendar({ searchParams }: { searchParams: Promise<{ start?: string; days?: string; property?: string }> }) {
  const u = await requireUser(["admin"], "/admin/calendar");
  return <MultiCalendar u={u} basePath="/admin/calendar" sp={await searchParams} />;
}

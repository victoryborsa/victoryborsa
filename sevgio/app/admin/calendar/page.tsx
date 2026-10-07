import Link from "next/link";
import { requireUser } from "@/lib/auth.ts";
import { MultiCalendar, type CalParams } from "@/components/MultiCalendar.tsx";

export default async function AdminCalendar({ searchParams }: { searchParams: Promise<CalParams> }) {
  const u = await requireUser(["admin"], "/admin/calendar");
  return (
    <>
      <p style={{ margin: "0 0 12px" }}><Link className="btn btn-primary" href="/admin/bookings/new">+ Add Manual Reservation</Link></p>
      <MultiCalendar u={u} basePath="/admin/calendar" sp={await searchParams} />
    </>
  );
}

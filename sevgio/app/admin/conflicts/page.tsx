import type { Metadata } from "next";
import { requireUser } from "@/lib/auth.ts";
import { ConflictsList } from "@/components/ConflictPages.tsx";

export const metadata: Metadata = { title: "Double bookings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const u = await requireUser(["admin"], "/admin/conflicts");
  return <ConflictsList u={u} base="/admin" tab={(await searchParams).tab} />;
}

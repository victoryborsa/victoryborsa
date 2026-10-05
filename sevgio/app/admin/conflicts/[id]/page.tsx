import type { Metadata } from "next";
import { requireUser } from "@/lib/auth.ts";
import { ConflictReview } from "@/components/ConflictPages.tsx";

export const metadata: Metadata = { title: "Review conflict", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser(["admin"], `/admin/conflicts/${id}`);
  return <ConflictReview u={u} base="/admin" id={id} />;
}

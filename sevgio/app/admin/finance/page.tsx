import { requireUser } from "@/lib/auth.ts";
import { FinanceView } from "@/components/FinanceView.tsx";

export default async function AdminFinance({ searchParams }: { searchParams: Promise<{ month?: string; property?: string }> }) {
  const u = await requireUser(["admin"], "/admin/finance");
  return <FinanceView u={u} basePath="/admin/finance" sp={await searchParams} />;
}

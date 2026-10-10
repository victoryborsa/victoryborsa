import { requireUser } from "@/lib/auth.ts";
import { FinanceView, type FinanceSearch } from "@/components/FinanceView.tsx";

export default async function AdminFinance({ searchParams }: { searchParams: Promise<FinanceSearch> }) {
  const u = await requireUser(["admin"], "/admin/finance");
  return <FinanceView u={u} basePath="/admin/finance" sp={await searchParams} />;
}

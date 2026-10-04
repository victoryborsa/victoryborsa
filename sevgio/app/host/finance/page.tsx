import { requireUser } from "@/lib/auth.ts";
import { FinanceView, type FinanceSearch } from "@/components/FinanceView.tsx";

export default async function HostFinance({ searchParams }: { searchParams: Promise<FinanceSearch> }) {
  const u = await requireUser(["host", "admin"], "/host/finance");
  return <FinanceView u={u} basePath="/host/finance" sp={await searchParams} />;
}

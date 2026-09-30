import { requireUser } from "@/lib/auth.ts";
import { FinanceView } from "@/components/FinanceView.tsx";

export default async function HostFinance({ searchParams }: { searchParams: Promise<{ month?: string; property?: string }> }) {
  const u = await requireUser(["host", "admin"], "/host/finance");
  return <FinanceView u={u} basePath="/host/finance" sp={await searchParams} />;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LinkProblem } from "@/components/ResetLinkProblem.tsx";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

/** /reset with no token (a link that got cut short), or /reset?token=… from older or rewritten links. */
export default async function ResetNoToken({ searchParams }: { searchParams: Promise<{ token?: string; t?: string }> }) {
  const sp = await searchParams;
  const token = sp.token || sp.t;
  if (token) redirect(`/reset/${encodeURIComponent(token)}`);
  return <LinkProblem />;
}

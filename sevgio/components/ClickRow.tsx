"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** A table row that opens `href` when tapped anywhere, except on its own links, buttons and form fields. */
export function ClickRow({ href, children, className, ...rest }: { href: string; children: ReactNode; className?: string } & Record<`data-${string}`, string | undefined>) {
  const router = useRouter();
  return (
    <tr {...rest} className={["click-row", className].filter(Boolean).join(" ")}
      onClick={e => {
        if ((e.target as HTMLElement).closest("a, button, input, select, textarea, label, summary, details, form")) return;
        if (window.getSelection()?.toString()) return; // selecting text to copy isn't a tap
        router.push(href);
      }}>
      {children}
    </tr>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** What the reservation panel shows for one stay on the calendar. */
export type StayDetail = { title: string; badge: string; badgeCls: string; color?: string; rows: [string, string][]; href?: string; hrefLabel?: string;
  /** Why it can or can't be edited; `locked` shows it as read-only. `msgHref` opens the guest conversation. */
  note?: string; locked?: boolean; msgHref?: string };

/**
 * Clicking anything on the calendar marked `data-stay` opens that reservation's details in a panel,
 * instead of leaving the calendar. Ctrl/⌘-click still opens the full page in a new tab.
 */
export function CalDetails({ details }: { details: Record<string, StayDetail> }) {
  const [key, setKey] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const d = key ? details[key] : null;

  useEffect(() => {
    const target = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>("[data-stay]");
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = target(e);
      if (!el || !details[el.dataset.stay!]) return;
      // Capture phase on the document: runs before the link would navigate.
      e.preventDefault();
      e.stopPropagation();
      setKey(el.dataset.stay!);
    };
    const onKey = (e: KeyboardEvent) => {
      const el = target(e);
      if (el && el.tagName !== "A" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); el.click(); }
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("keydown", onKey, true); };
  }, [details]);

  useEffect(() => {
    const dlg = ref.current;
    if (d && dlg && !dlg.open) dlg.showModal();
  }, [d]);

  return (
    <dialog ref={ref} className="sd" aria-label={d ? `Reservation: ${d.title}` : "Reservation"} onClose={() => setKey(null)}
      onClick={e => { if (e.target === ref.current) ref.current?.close(); }}>
      {d && (
        <div className="sd-in" style={{ ["--pc" as string]: d.color }}>
          <div className="sd-head">
            <h3><i className="ar-dot" aria-hidden />{d.title}</h3>
            <button type="button" className="sd-x" aria-label="Close" onClick={() => ref.current?.close()}>×</button>
          </div>
          <span className={`pill ${d.badgeCls}`}>{d.badge}</span>
          {d.note && <p className={`sd-note${d.locked ? " locked" : ""}`} data-testid="sd-note">{d.locked ? "Read-only. " : ""}{d.note}</p>}
          <dl className="sd-rows">
            {d.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <div className="sd-actions">
            {d.href && <Link className="btn btn-primary" href={d.href}>{d.hrefLabel || "Open full reservation"}</Link>}
            {d.msgHref && <Link className="btn btn-ghost" href={d.msgHref}>Messages</Link>}
            <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>Close</button>
          </div>
        </div>
      )}
    </dialog>
  );
}

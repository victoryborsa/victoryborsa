"use client";
import { useEffect, useRef, useState } from "react";
import { ShareButtons } from "./ShareButtons.tsx";
import { sendSignal } from "@/lib/signal-client.ts";

type Stats = { views: number; favorites: number; interested: number; shares: number; saved: boolean };

const svg = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const Eye = () => <svg {...svg}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
const Heart = ({ filled }: { filled?: boolean }) => <svg {...svg} fill={filled ? "currentColor" : "none"}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>;
const Person = () => <svg {...svg}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
const ShareIcon = () => <svg {...svg}><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" /></svg>;

const isStats = (r: unknown): r is Stats => typeof (r as Stats | null)?.views === "number";
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Save (heart) and Share buttons for a listing, plus the line "428 views · 93 times saved as favourite · 3 interested · 3 times shared". */
export function ListingStats({ slug, url, title, initial }: { slug: string; url: string; title: string; initial: Stats }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);
  // Replies can arrive out of order (a slow view report after a Save tap); only the newest one is used.
  const seq = useRef(0);
  const report = async (kind: "view" | "favorite" | "share", extra?: { channel?: string; on?: boolean }) => {
    const n = ++seq.current;
    const r = await sendSignal(slug, kind, extra);
    if (n === seq.current && isStats(r)) setS(r);
  };

  useEffect(() => {
    if (sent.current) return; // StrictMode runs effects twice in development
    sent.current = true;
    report("view");
  }, [slug]);

  const toggleSave = async () => {
    const on = !s.saved;
    setBusy(true);
    setS(x => ({ ...x, saved: on, favorites: Math.max(0, x.favorites + (on ? 1 : -1)) }));
    await report("favorite", { on });
    setBusy(false);
  };
  const onShare = (channel: string) => {
    report("share", { channel });
  };

  const items = [
    s.views > 0 && <li key="v"><Eye />{plural(s.views, "view", "views")}</li>,
    s.favorites > 0 && <li key="f"><Heart />{plural(s.favorites, "time saved as favourite", "times saved as favourite")}</li>,
    s.interested > 0 && <li key="i"><Person />{plural(s.interested, "interested", "interested")}</li>,
    s.shares > 0 && <li key="s"><ShareIcon />{plural(s.shares, "time shared", "times shared")}</li>,
  ].filter(Boolean);

  return (
    <>
      <div className="listing-actions">
        <button type="button" className={`btn btn-ghost btn-sm save-btn${s.saved ? " on" : ""}`} aria-pressed={s.saved} disabled={busy} onClick={toggleSave}>
          <Heart filled={s.saved} />{s.saved ? "Saved" : "Save"}
        </button>
        <ShareButtons url={url} title={title} onShare={onShare} />
      </div>
      {items.length > 0 && <ul className="listing-stats" aria-label="Listing activity">{items}</ul>}
    </>
  );
}

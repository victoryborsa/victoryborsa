"use client";
import { useEffect, useRef, useState } from "react";
import { statsPost } from "./ListingStats.tsx";

/** "Share" button for a listing: email, text message, WhatsApp, Facebook, X, Instagram (via the phone's share sheet) or copy the link. */
export function ShareButtons({ url, title, statsId }: { url: string; title: string; statsId?: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [native, setNative] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { setNative(typeof navigator !== "undefined" && !!navigator.share); }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  // Counts the share on the listing's "times shared" number.
  const counted = () => { if (statsId) statsPost(statsId, { kind: "share" }).then(r => r && window.dispatchEvent(new CustomEvent("sevgio:shared", { detail: r }))); };
  const text = `${title} on Sevgio Stays`;
  const u = encodeURIComponent(url), t = encodeURIComponent(text), both = encodeURIComponent(`${text}: ${url}`);
  const copy = async (msg = "Link copied.") => {
    counted();
    try { await navigator.clipboard.writeText(url); setNote(msg); } catch { setNote(url); }
  };
  const nativeShare = async () => { try { await navigator.share({ title: text, text, url }); counted(); } catch { /* closed */ } };
  const links: [string, string, string][] = [
    ["Email", "✉️", `mailto:?subject=${t}&body=${both}`],
    ["Text message", "💬", `sms:?&body=${both}`],
    ["WhatsApp", "🟢", `https://wa.me/?text=${both}`],
    ["Facebook", "📘", `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ["Messenger", "💭", `fb-messenger://share/?link=${u}`],
    ["X (Twitter)", "✖️", `https://x.com/intent/post?text=${t}&url=${u}`],
  ];
  return (
    <div className="share" ref={box}>
      <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} aria-haspopup="true" onClick={() => { setOpen(!open); setNote(""); }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" /></svg>
        Share
      </button>
      {open && (
        <div className="share-menu" role="menu" aria-label="Share this place">
          <p className="share-title">Share this place</p>
          {links.map(([name, icon, href]) => (
            <a key={name} role="menuitem" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => { counted(); setOpen(false); }}><span aria-hidden>{icon}</span>{name}</a>
          ))}
          <button type="button" role="menuitem" onClick={() => (native ? nativeShare() : copy("Link copied. Paste it in your Instagram story, post or message."))}><span aria-hidden>📸</span>Instagram</button>
          <button type="button" role="menuitem" onClick={() => copy()}><span aria-hidden>🔗</span>Copy link</button>
          {native && <button type="button" role="menuitem" onClick={nativeShare}><span aria-hidden>⋯</span>More apps</button>}
          {note && <p className="hint share-note" role="status">{note}</p>}
        </div>
      )}
    </div>
  );
}

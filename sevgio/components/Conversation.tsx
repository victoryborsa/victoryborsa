"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendBookingMessageAction } from "@/app/actions/conversation.ts";
import type { ConvMessage, Side } from "@/lib/messaging.ts";

type Shown = ConvMessage & { state?: "sending" | "failed"; error?: string };

const EMAIL_NOTE: Record<string, string> = {
  sent: "Email notice sent",
  queued: "Email notice waiting to retry",
  failed: "Email notice failed",
  off: "Email notices aren't set up",
};

const when = (t: string) => new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const newId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

/**
 * One reservation's conversation. Your own messages show Sending, Sent, Read or Failed: Sent means Sevgio saved it and the other
 * side can see it; Read means they opened the conversation. Delivery to an email inbox is never claimed.
 */
export function Conversation({ bookingId, side, initial, otherName }: { bookingId: string; side: Side; initial: ConvMessage[]; otherName: string }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Shown[]>(initial);
  const [text, setText] = useState("");
  const [, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  // Fresh messages from the server replace the list, keeping any still sending or failed here.
  useEffect(() => {
    setMsgs(cur => [...initial, ...cur.filter(m => m.state && !initial.some(x => x.client_id && x.client_id === m.client_id))]);
  }, [initial]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);
  // New replies appear without reloading: check every 20 seconds while the page is open.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 20000);
    return () => clearInterval(t);
  }, [router]);

  const send = (body: string, clientId: string) => {
    setMsgs(cur => [...cur.filter(m => m.client_id !== clientId), { id: clientId, client_id: clientId, from_guest: side === "guest", body, created_at: new Date().toISOString(), read_at: null, email_status: "pending", sender_name: null, state: "sending" }]);
    start(async () => {
      let r: Awaited<ReturnType<typeof sendBookingMessageAction>>;
      try { r = await sendBookingMessageAction(bookingId, body, clientId); } catch { r = { ok: false, error: "No connection. Your message wasn't sent." }; }
      setMsgs(cur => cur.map(m => m.client_id !== clientId ? m : r.ok ? { ...r.message } : { ...m, state: "failed", error: r.error }));
      if (r.ok) router.refresh();
    });
  };

  const mine = (m: Shown) => m.from_guest === (side === "guest");
  return (
    <div className="cv">
      <div className="cv-list" role="log" aria-live="polite" aria-label="Messages">
        {msgs.length === 0 && <p className="muted cv-empty">No messages yet. Write the first one below.</p>}
        {msgs.map(m => (
          <div key={m.id} className={`cv-msg ${mine(m) ? "me" : "them"}${m.state === "failed" ? " failed" : ""}`} data-testid="cv-msg">
            <span className="cv-who">{mine(m) ? "You" : m.from_guest ? otherName : m.sender_name || otherName} · {when(m.created_at)}</span>
            <p className="cv-body">{m.body}</p>
            {mine(m) && (
              <span className="cv-state" data-state={m.state || (m.read_at ? "read" : "sent")}>
                {m.state === "sending" ? "Sending…" : m.state === "failed" ? <>Failed: {m.error} <button type="button" className="linkbtn" onClick={() => send(m.body, m.client_id || newId())}>Try again</button></>
                  : m.read_at ? `Read ${when(m.read_at)}` : "Sent"}
                {!m.state && EMAIL_NOTE[m.email_status] ? ` · ${EMAIL_NOTE[m.email_status]}` : ""}
              </span>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="cv-form" onSubmit={e => { e.preventDefault(); const body = text.trim(); if (!body) return; setText(""); send(body, newId()); }}>
        <label className="sr-only" htmlFor="cv-text">Message</label>
        <textarea id="cv-text" className="input" rows={3} maxLength={4000} value={text} onChange={e => setText(e.target.value)} placeholder={`Write to ${otherName}…`}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit(); }} />
        <button className="btn btn-primary" disabled={!text.trim()}>Send</button>
      </form>
    </div>
  );
}

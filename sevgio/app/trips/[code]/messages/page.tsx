import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser, safeNext } from "@/lib/auth.ts";
import { fmtDate } from "@/lib/dates.ts";
import { conversationAccess, markRead, messagesFor } from "@/lib/messaging.ts";
import { Conversation } from "@/components/Conversation.tsx";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The conversation for one Sevgio.com reservation. The guest, the listing's host and admins can read and reply. */
export default async function BookingMessages({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ back?: string }> }) {
  const { code } = await params;
  const u = await requireUser(undefined, `/trips/${code}/messages`);
  const access = await conversationAccess(u, { code });
  if (!access) notFound();
  const { b, side } = access;
  await markRead(b.id, side);
  const messages = await messagesFor(b.id);
  const back = safeNext((await searchParams).back, side === "staff" ? (u.role === "admin" ? "/admin/calendar" : "/host/calendar") : `/trips/${b.code}`);
  return (
    <div className="wrap page-pad theme-light acct cv-page">
      <div className="crumbs" style={{ paddingTop: 0 }}><Link href={back}>← Back</Link></div>
      <header className="cv-head box">
        <div>
          <span className="eyebrow">Messages · booking {b.code}</span>
          <h1 className="h-like-2">{side === "staff" ? b.guest_name : b.title}</h1>
          <p className="muted">{b.title} · {fmtDate(b.check_in, { month: "short", day: "numeric" })} - {fmtDate(b.check_out, { month: "short", day: "numeric", year: "numeric" })}</p>
        </div>
        <Link className="btn btn-ghost btn-sm" href={side === "staff" && u.role === "admin" ? `/admin/bookings/${b.code}` : `/trips/${b.code}`}>Reservation details</Link>
      </header>
      <Conversation bookingId={b.id} side={side} initial={messages} otherName={side === "staff" ? b.guest_name : "your host"} />
      <p className="hint" style={{ marginTop: 10 }}>
        {side === "staff" ? `${b.guest_name} sees these messages on their booking page and gets an email notice for each one.` : "Your host sees these messages in Sevgio and gets an email notice for each one."}
        {" "}“Sent” means Sevgio saved the message; “Read” means the other person opened this conversation.
      </p>
    </div>
  );
}

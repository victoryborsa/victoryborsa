import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth.ts";
import { one } from "@/lib/db.ts";
import type { Booking } from "@/lib/bookings.ts";
import { todayLocal, fmtDate, fmtDay } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";
import { partyLabel } from "@/lib/party.ts";
import { getSettings } from "@/lib/settings.ts";
import { methodLabel } from "@/lib/payment-rules.ts";
import { KEEP_REFERENCE } from "@/lib/booking-ref.ts";
import { paymentText, reservationStatus } from "@/lib/statuses.ts";
import { BrandLogo } from "@/components/BrandLogo.tsx";
import { PriceBreakdown } from "@/components/booking-summary.tsx";
import { PrintButton } from "@/components/PrintButton.tsx";

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };
export const dynamic = "force-dynamic";

type Row = Booking & { title: string; city: string; address: string; host_id: string; guest_email: string };

/** A printable invoice for one booking. Its number is the booking reference, the same one on the confirmation and in admin. */
export default async function Invoice({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const u = await requireUser(undefined, `/trips/${code}/invoice`);
  const b = await one<Row>(
    `SELECT b.*, p.title, p.city, p.address, p.host_id, g.email AS guest_email
     FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.guest_id WHERE b.code = $1`,
    [code.toUpperCase()],
  );
  // Same rule as the booking page: only the guest, the listing's host, or an admin.
  if (!b || !(b.guest_id === u.id || b.host_id === u.id || u.role === "admin")) notFound();
  const s = await getSettings();
  const pay = paymentText(b);
  const st = reservationStatus({ ...b, today: todayLocal() });
  const total = b.total_cents + b.card_fee_cents;
  const paid = b.paid_cents + (b.payment_method === "card" ? b.card_fee_cents : 0);
  const cancelled = ["cancelled", "declined", "expired"].includes(b.status);
  return (
    <div className="wrap page-pad theme-light invoice-page">
      <div className="row no-print" style={{ marginBottom: 16 }}>
        <Link href={`/trips/${b.code}`}>← Back to the booking</Link>
        <span className="spacer" />
        <PrintButton />
      </div>
      <article className="invoice box" aria-label={`Invoice ${b.code}`}>
        <div className="inv-head">
          <BrandLogo size={44} />
          <div className="inv-title">
            <h1>Invoice</h1>
            <div className="code ref-code" data-testid="invoice-ref">{b.code}</div>
            <div className="hint">Booking reference and invoice number</div>
          </div>
        </div>
        {cancelled && <div className="notice warn" role="status">This booking is cancelled{st.detail ? ` (${st.detail.toLowerCase()})` : ""}. The reference stays the same for your records.</div>}
        <div className="inv-cols">
          <section>
            <h2 className="inv-h">Billed to</h2>
            <p><b>{b.guest_name}</b><br />{b.guest_email}<br />{b.guest_phone}</p>
          </section>
          <section>
            <h2 className="inv-h">Stay</h2>
            <p><b>{b.title}</b><br />{b.address || b.city}<br />{fmtDate(b.check_in)} - {fmtDate(b.check_out)} ({b.nights} night{b.nights === 1 ? "" : "s"})<br />{partyLabel(b)}</p>
          </section>
          <section>
            <h2 className="inv-h">Details</h2>
            <dl className="kv inv-kv">
              <dt>Issued</dt><dd>{fmtDay(b.created_at)}</dd>
              <dt>Status</dt><dd>{st.label}</dd>
              <dt>Payment</dt><dd>{pay}</dd>
              {b.payment_method && <><dt>Method</dt><dd>{methodLabel(b)}</dd></>}
            </dl>
          </section>
        </div>
        <PriceBreakdown b={b} />
        <dl className="inv-sum">
          {!cancelled && <div className="inv-due"><dt>Balance due</dt><dd>{money(Math.max(0, total - paid))}</dd></div>}
        </dl>
        {b.security_deposit_cents > 0 && <p className="hint">Refundable security deposit of {money(b.security_deposit_cents)} is collected separately and is not part of this invoice.</p>}
        <div className="inv-foot">
          <p><b>{KEEP_REFERENCE}</b></p>
          <p className="hint">Sevgio · Pittsburgh, PA{s.contact_email ? ` · ${s.contact_email}` : ""}{s.contact_phone ? ` · ${s.contact_phone}` : ""}</p>
        </div>
      </article>
    </div>
  );
}

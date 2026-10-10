import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage.tsx";
import { pageMeta } from "@/lib/seo.tsx";
import { CANCELLATION } from "@/lib/constants.ts";

export const metadata: Metadata = pageMeta("/cancellation-policy", "Cancellation Policy", "How cancellations and refunds work for Sevgio stays: Flexible, Moderate and Firm policies, request withdrawals and host cancellations.");

export default function CancellationPolicy() {
  return (
    <LegalPage title="Cancellation Policy" updated="October 7, 2026" intro="Every home uses one of three cancellation policies. The one that applies is shown on the listing and again before you book.">
      <section>
        <h2>The three policies</h2>
        <table className="legal-table">
          <thead><tr><th>Policy</th><th>What it means</th></tr></thead>
          <tbody>{Object.values(CANCELLATION).map(c => <tr key={c.label}><td><b>{c.label}</b></td><td>{c.text}</td></tr>)}</tbody>
        </table>
      </section>
      <section>
        <h2>How to cancel</h2>
        <ul>
          <li>Open <a href="/trips">My trips</a>, choose the booking and press <b>Cancel booking</b>. You get an email confirming the cancellation, and the reference stays the same for your records.</li>
          <li>Booked by phone or email? Contact us with your booking reference and we&apos;ll cancel it for you.</li>
          <li>A request the host hasn&apos;t accepted yet can be withdrawn at any time, and nothing is owed.</li>
        </ul>
      </section>
      <section>
        <h2>Refunds</h2>
        <p>Refunds go back the way you paid, usually within 5 to 10 business days. Card processing fees charged by the payment provider may not be refundable.</p>
      </section>
      <section>
        <h2>If the host cancels</h2>
        <p>If we or the host have to cancel your confirmed booking, you receive a full refund of what you paid, and we will help you find another home.</p>
      </section>
    </LegalPage>
  );
}

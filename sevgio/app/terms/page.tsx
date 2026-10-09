import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage.tsx";
import { pageMeta } from "@/lib/seo.tsx";

export const metadata: Metadata = pageMeta("/terms", "Terms & Conditions", "The terms for booking a furnished stay with Sevgio: reservations, payment, house rules, deposits, cancellations and liability.");

export default function Terms() {
  return (
    <LegalPage title="Terms & Conditions" updated="October 7, 2026" intro="These terms apply when you book or stay at a home through sevgio.com, or book directly with Sevgio by phone or email. By booking, you agree to them and to the home's house rules.">
      <section>
        <h2>Reservations</h2>
        <ul>
          <li>Each home is either <b>Instant booking</b> (confirmed straight away) or <b>Request to book</b> (the host has up to 48 hours to accept).</li>
          <li>Your booking reference (it starts with SV-) is your confirmation number. Keep it for any question about your stay.</li>
          <li>The person who books must be 18 or older and stay at the home. The number of guests may not exceed the home&apos;s maximum.</li>
        </ul>
      </section>
      <section>
        <h2>Prices and payment</h2>
        <ul>
          <li>The total shown before you book includes the nightly or monthly rate, cleaning fee, any pet or extra-service fees and taxes. There are no hidden fees.</li>
          <li>Depending on the home, you pay online by card or bank transfer, by Zelle or Venmo, or at the property. Your confirmation says which and when.</li>
          <li>If a payment is due and not received by the deadline shown, the booking is cancelled and the dates are released.</li>
          <li>A refundable security deposit, when a home has one, is collected separately and returned after check-out if there is no damage or missing item.</li>
        </ul>
      </section>
      <section>
        <h2>House rules</h2>
        <p>Each listing shows its check-in and check-out times, maximum guests, pet, smoking, parking and security camera policies. Breaking the house rules (for example parties, smoking indoors or unregistered guests) can end the stay without a refund and may be charged against the deposit.</p>
      </section>
      <section>
        <h2>Cancellations</h2>
        <p>Each home has a cancellation policy, shown on the listing and before you book. See the <Link href="/cancellation-policy">Cancellation Policy</Link> for the details.</p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>If you need to change your dates or number of guests, contact us. Changes depend on availability and may change the price; you&apos;ll get an email with the updated reservation.</p>
      </section>
      <section>
        <h2>Liability</h2>
        <p>Guests are responsible for damage they or their visitors cause during the stay. Sevgio and its hosts are not responsible for personal belongings left at a home. If a home becomes unavailable for reasons outside our control, we will offer a comparable home or a full refund of what you paid for the affected nights.</p>
      </section>
      <section>
        <h2>Monthly and corporate stays</h2>
        <p>Stays of 30 nights or more, and corporate housing, may also require a signed rental agreement. Where that agreement differs from these terms, the agreement applies.</p>
      </section>
    </LegalPage>
  );
}

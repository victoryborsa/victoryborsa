import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage.tsx";
import { pageMeta } from "@/lib/seo.tsx";

export const metadata: Metadata = pageMeta("/host-terms", "Host Terms", "Terms for hosts listing a furnished home on Sevgio: accurate listings, calendars, guest safety, camera disclosure and payments.");

export default function HostTerms() {
  return (
    <LegalPage title="Host Terms" updated="October 7, 2026" intro="These terms apply to hosts who list a home on sevgio.com. Host accounts are approved by Sevgio.">
      <section>
        <h2>Accurate listings</h2>
        <ul>
          <li>Describe the home honestly: photos, bedrooms, bathrooms, maximum guests, amenities and fees.</li>
          <li>Pets, smoking, parking, check-in and check-out times and security cameras are set once in the listing settings and shown to guests everywhere. Don&apos;t repeat or contradict them in the description or house rules.</li>
          <li>Every exterior camera and doorbell camera must be disclosed with its location. Cameras are never allowed inside a home.</li>
        </ul>
      </section>
      <section>
        <h2>Calendars and bookings</h2>
        <ul>
          <li>Keep your calendar up to date, and connect your Airbnb, Booking.com and Vrbo calendars so dates booked elsewhere are blocked on Sevgio.</li>
          <li>Answer booking requests within 48 hours. Unanswered requests expire automatically.</li>
          <li>Honor confirmed bookings. If you must cancel, tell us immediately so we can help the guest.</li>
        </ul>
      </section>
      <section>
        <h2>Safety and laws</h2>
        <p>Hosts keep working smoke and carbon monoxide alarms, follow local short-term rental and tax rules, and keep any required permits and insurance.</p>
      </section>
      <section>
        <h2>Payments and fees</h2>
        <p>Listing fees, payment methods and payouts are agreed with Sevgio when your host account is approved, and shown on your host dashboard.</p>
      </section>
    </LegalPage>
  );
}

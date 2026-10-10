import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage.tsx";
import { pageMeta } from "@/lib/seo.tsx";

export const metadata: Metadata = pageMeta("/privacy", "Privacy Policy", "What information Sevgio collects when you search, book or contact us, how it is used and protected, and your choices.");

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="October 7, 2026" intro="This page explains what information Sevgio collects when you use sevgio.com, why, who we share it with, and the choices you have.">
      <section>
        <h2>What we collect</h2>
        <ul>
          <li><b>Account details:</b> your name, email address, optional phone number and a password (stored only as a secure one-way hash).</li>
          <li><b>Reservation details:</b> the home, dates, number of guests and pets, arrival time, messages to your host, and what was paid.</li>
          <li><b>Messages:</b> what you send through the contact, corporate housing and Ask the host forms.</li>
          <li><b>Payments:</b> card and bank payments are handled by Stripe. Sevgio never sees or stores your full card or bank account number.</li>
          <li><b>Technical information:</b> a sign-in cookie, your language choice, and anonymous counts of listing views and saves.</li>
        </ul>
      </section>
      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To create and manage your reservation, send confirmations, check-in instructions and receipts, and answer your questions.</li>
          <li>To keep the site secure (for example, limiting repeated sign-in attempts) and to fix errors.</li>
          <li>We do not sell your information and we do not use it for advertising.</li>
        </ul>
      </section>
      <section>
        <h2>Who we share it with</h2>
        <ul>
          <li><b>Your host:</b> your name, contact details and reservation details for your stay. The street address and arrival instructions are shared with you only after your booking is confirmed.</li>
          <li><b>Service providers</b> that run the site for us: website and database hosting (Render), email delivery (Google), payments (Stripe) and maps. They may use the information only to provide their service.</li>
          <li>When the law requires it, or to protect guests, hosts or property.</li>
        </ul>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <p>Reservation and payment records are kept as long as needed for accounting and tax purposes. Unconfirmed accounts with no bookings are removed automatically after 7 days. You can ask us to delete your account at any time; we keep only what the law requires.</p>
      </section>
      <section>
        <h2>Your choices</h2>
        <ul>
          <li>Update your name, phone and password on your <a href="/account">Account</a> page.</li>
          <li>Ask us for a copy of your information, to correct it, or to delete it, using the contact details below.</li>
          <li>You can block cookies in your browser, but you will not be able to sign in or book without the sign-in cookie.</li>
        </ul>
      </section>
      <section>
        <h2>Security</h2>
        <p>Pages are served over HTTPS, passwords are hashed, sign-in sessions are stored securely and can be ended everywhere by changing your password, and staff access is limited by role.</p>
      </section>
      <section>
        <h2>Children</h2>
        <p>Accounts and bookings are for adults 18 and over.</p>
      </section>
    </LegalPage>
  );
}

import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage.tsx";
import { pageMeta } from "@/lib/seo.tsx";

export const metadata: Metadata = pageMeta("/accessibility", "Accessibility", "Sevgio's commitment to an accessible website and how to get help or describe accessibility needs for your stay.");

export default function Accessibility() {
  return (
    <LegalPage title="Accessibility" updated="October 7, 2026" intro="We want everyone to be able to find and book a stay on sevgio.com. We aim to follow the Web Content Accessibility Guidelines (WCAG) 2.1, level AA.">
      <section>
        <h2>What we do</h2>
        <ul>
          <li>Pages work with a keyboard and screen readers, with a “Skip to content” link, labelled form fields and buttons, and text alternatives for photos.</li>
          <li>Text and buttons keep readable contrast, and pages work when zoomed and on phones, tablets and computers.</li>
          <li>Date pickers can be used with the keyboard, and dates that can&apos;t be booked are announced as unavailable.</li>
        </ul>
      </section>
      <section>
        <h2>The homes</h2>
        <p>Each listing describes stairs, bathrooms, parking and entrance details. If you need step-free access, grab bars or other features, contact us before booking and we will tell you exactly what each home offers.</p>
      </section>
      <section>
        <h2>Tell us about a problem</h2>
        <p>If any part of the site is hard to use, please let us know what page and what happened. We will help you complete your booking by phone or email straight away and fix the problem.</p>
      </section>
    </LegalPage>
  );
}

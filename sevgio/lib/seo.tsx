// Search engine helpers: one canonical address per page, and structured data (schema.org) describing Sevgio and each home.
import type { Metadata } from "next";

export const SITE_DESCRIPTION = "Furnished short-term and monthly rentals in Pittsburgh for travel nurses, traveling physicians, corporate teams, relocating employees and young professionals. Book direct with Sevgio.";

/** Title, description, canonical address and link-preview text for a public page. */
export function pageMeta(path: string, title: string, description: string, extra: Metadata = {}): Metadata {
  return {
    title, description,
    alternates: { canonical: path },
    openGraph: { title: `${title} · Sevgio`, description, url: path, type: "website", siteName: "Sevgio", ...(extra.openGraph || {}) },
    ...extra,
  };
}

/** Sevgio as a lodging business, for the home and corporate housing pages. */
export function businessLd(site: string, contact: { email?: string; phone?: string }) {
  return {
    "@context": "https://schema.org", "@type": "LodgingBusiness", name: "Sevgio", url: site, description: SITE_DESCRIPTION,
    logo: `${site}/icon.png`, image: `${site}/opengraph-image`,
    address: { "@type": "PostalAddress", addressLocality: "Pittsburgh", addressRegion: "PA", addressCountry: "US" },
    areaServed: { "@type": "City", name: "Pittsburgh" },
    ...(contact.email ? { email: contact.email } : {}), ...(contact.phone ? { telephone: contact.phone } : {}),
  };
}

const TYPES: Record<string, string> = { apartment: "Apartment", house: "House", room: "Room", condo: "Apartment", townhouse: "House" };

/** One home: what it is, where (town only, never the street address), how many it sleeps, and its price. */
export function listingLd(site: string, p: { slug: string; title: string; description: string; property_type: string; city: string; area: string; bedrooms: number; bathrooms: number; max_guests: number;
  nightly_price_cents: number; corp_lease_only?: boolean; corp_monthly_cents?: number | null; amenities: string[]; rating: number | null; review_count: number }, images: string[]) {
  const monthly = p.corp_lease_only && p.corp_monthly_cents;
  return {
    "@context": "https://schema.org", "@type": TYPES[p.property_type] || "Accommodation", name: p.title, url: `${site}/stays/${p.slug}`,
    description: p.description.slice(0, 500), ...(images.length ? { image: images } : {}),
    address: { "@type": "PostalAddress", addressLocality: p.city, addressRegion: "PA", addressCountry: "US" },
    numberOfBedrooms: p.bedrooms, numberOfBathroomsTotal: Number(p.bathrooms), occupancy: { "@type": "QuantitativeValue", maxValue: p.max_guests },
    petsAllowed: p.amenities.includes("pets"),
    offers: { "@type": "Offer", priceCurrency: "USD", price: ((monthly || p.nightly_price_cents) / 100).toFixed(2), availability: "https://schema.org/InStock",
      priceSpecification: { "@type": "UnitPriceSpecification", price: ((monthly || p.nightly_price_cents) / 100).toFixed(2), priceCurrency: "USD", unitText: monthly ? "MONTH" : "NIGHT" } },
    ...(p.rating && p.review_count ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.review_count } } : {}),
  };
}

/** Structured data as a script tag. "<" is escaped so text from a listing can never close the tag. */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

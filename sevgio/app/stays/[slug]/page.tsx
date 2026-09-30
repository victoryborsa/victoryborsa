import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { propertyBySlug, photosFor, photoUrl, linkedListings } from "@/lib/queries.ts";
import { PropertyCard } from "@/components/PropertyCard.tsx";
import { unavailableNights } from "@/lib/bookings.ts";
import { currentUser } from "@/lib/auth.ts";
import { getSettings } from "@/lib/settings.ts";
import { one } from "@/lib/db.ts";
import { addDays, todayLocal } from "@/lib/dates.ts";
import { AMENITIES, CANCELLATION, PROPERTY_TYPES } from "@/lib/constants.ts";
import { Gallery } from "@/components/Gallery.tsx";
import { AvailabilitySection, BookingPanel, BookingProvider, MobileBookBar } from "@/components/booking.tsx";
import { Check, Rating } from "@/components/ui.tsx";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { askHostAction } from "@/app/actions/messages.ts";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

async function load(slug: string) {
  const p = await propertyBySlug(slug);
  if (!p) return null;
  if (p.status !== "published") {
    const u = await currentUser();
    if (!u || !(u.role === "admin" || u.id === p.host_id)) return null; // hosts and admins can preview unpublished listings
  }
  return p;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const p = await load((await params).slug);
  if (!p) return { title: "Stay not found" };
  const photos = await photosFor(p.id);
  return {
    title: `${p.title}, ${p.city}`,
    description: p.description.slice(0, 160),
    openGraph: photos[0] ? { images: [photoUrl(photos[0].id)] } : undefined,
  };
}

export default async function StayPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const sp = await searchParams;
  const p = await load(slug);
  if (!p) notFound();
  const today = todayLocal();
  const [photos, taken, settings, host, user, linked] = await Promise.all([
    photosFor(p.id),
    unavailableNights(p.id, today, addDays(today, 560)),
    getSettings(),
    one<{ name: string }>("SELECT name FROM users WHERE id = $1", [p.host_id]),
    currentUser(),
    linkedListings(p),
  ]);
  const hostFirst = (host?.name || "your host").split(" ")[0];
  const bookable = p.status === "published";

  return (
    <div className="wrap has-mobile-book">
      <div className="crumbs"><Link href="/stays">← All stays</Link></div>
      {!bookable && <div className="notice warn" style={{ marginBottom: 12 }}>Preview: this listing is <b>{p.status}</b> and not visible to guests.</div>}
      <div className="row" style={{ alignItems: "end", marginBottom: 16 }}>
        <div className="stack" style={{ gap: 6, flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: "clamp(26px,4vw,36px)" }}>{p.title}</h1>
          <div className="row" style={{ gap: "8px 16px" }}>
            <Rating rating={p.rating} count={p.review_count} />
            <span className="muted">{p.city}{p.area ? `, ${p.area}` : ""}, Pennsylvania</span>
            {p.booking_mode === "instant" ? <span className="pill ok">Instant booking</span> : <span className="pill warn">Request to book</span>}
          </div>
        </div>
      </div>
      <Gallery photos={photos.map(ph => ({ id: ph.id, caption: ph.caption }))} title={p.title} />

      <BookingProvider
        p={{ slug: p.slug, nightly_price_cents: p.nightly_price_cents, cleaning_fee_cents: p.cleaning_fee_cents, min_nights: p.min_nights, max_nights: p.max_nights, max_guests: p.max_guests, booking_mode: p.booking_mode }}
        today={today}
        unavailable={taken}
        taxPercent={settings.tax_percent}
        initial={{ ci: sp.ci || "", co: sp.co || "", guests: Number(sp.guests) || 2 }}
        bookable={bookable}
      >
        <div className="detail-grid">
          <div className="detail-main">
            <div className="facts">
              <div className="fact"><b>{p.max_guests}</b><span>guests</span></div>
              <div className="fact"><b>{p.bedrooms}</b><span>bedroom{p.bedrooms === 1 ? "" : "s"}</span></div>
              <div className="fact"><b>{p.beds}</b><span>bed{p.beds === 1 ? "" : "s"}</span></div>
              <div className="fact"><b>{p.bathrooms}</b><span>{p.bathroom_type === "shared" ? "shared" : "private"} bathroom{p.bathrooms === 1 ? "" : "s"}</span></div>
            </div>
            {linked.parent && (
              <div className="notice info">
                <div>This is a private room in <Link href={`/stays/${linked.parent.slug}`}>{linked.parent.title}</Link>. Traveling with a bigger group? You can book the whole home instead.</div>
              </div>
            )}
            <section>
              <h2>About this {(PROPERTY_TYPES[p.property_type] || "home").toLowerCase()}</h2>
              <p className="prose">{p.description}</p>
              <p className="muted">Hosted by {host?.name}. {p.city}{p.area ? `, ${p.area}` : ""}, PA. The exact address is shared once your booking is confirmed.</p>
            </section>
            {p.amenities.length > 0 && (
              <section>
                <h2>Amenities</h2>
                <ul className="amen">{p.amenities.filter(a => AMENITIES[a]).map(a => <li key={a}><Check />{AMENITIES[a]}</li>)}</ul>
              </section>
            )}
            <AvailabilitySection />
            {linked.rooms.length > 0 && (
              <section>
                <h2>Just need a room?</h2>
                <p className="muted">You can also book individual rooms in this home. When a room is booked, the whole home isn't available for those dates.</p>
                <div className="cards">{linked.rooms.map(r => <PropertyCard key={r.id} p={r} taxPercent={settings.tax_percent} ci={sp.ci} co={sp.co} guests={Number(sp.guests) || undefined} />)}</div>
              </section>
            )}
            <section>
              <h2>House rules</h2>
              <dl className="kv">
                <dt>Check-in</dt><dd>After {p.check_in_time}</dd>
                <dt>Check-out</dt><dd>Before {p.check_out_time}</dd>
                <dt>Minimum stay</dt><dd>{p.min_nights} night{p.min_nights > 1 ? "s" : ""}</dd>
                <dt>Maximum guests</dt><dd>{p.max_guests}</dd>
              </dl>
              {p.house_rules.length > 0 && <ul className="rules">{p.house_rules.map((r, i) => <li key={i}>{r}</li>)}</ul>}
            </section>
            <section>
              <h2>Cancellation policy</h2>
              <p><span className="pill neutral">{CANCELLATION[p.cancellation_policy]?.label}</span></p>
              <p className="prose">{CANCELLATION[p.cancellation_policy]?.text}</p>
            </section>
            <section>
              <h2>Questions about this home?</h2>
              <ActionForm action={askHostAction} className="stack" resetOnOk>
                <input type="hidden" name="property_id" value={p.id} />
                <div className="grid-2">
                  <label className="field"><span>Your name</span><input className="input" name="name" autoComplete="name" defaultValue={user?.name} required /></label>
                  <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" defaultValue={user?.email} required /></label>
                </div>
                <label className="field"><span>Message to {hostFirst}</span><textarea className="input" name="body" placeholder="Is early check-in possible? Is there a crib?" required /></label>
                <div style={{ position: "absolute", left: -9999 }} aria-hidden="true"><label>Leave empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
                <div><SubmitButton className="btn btn-ghost" pendingText="Sending…">Send question</SubmitButton></div>
              </ActionForm>
            </section>
          </div>
          <BookingPanel paymentNote={settings.payment_note} />
        </div>
        <MobileBookBar />
      </BookingProvider>
    </div>
  );
}

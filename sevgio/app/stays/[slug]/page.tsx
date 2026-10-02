import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { propertyBySlug, photosFor, photoUrl, linkedListings } from "@/lib/queries.ts";
import { PropertyCard } from "@/components/PropertyCard.tsx";
import { demandBetween, demandForClient } from "@/lib/demand.ts";
import { unavailableNights } from "@/lib/bookings.ts";
import { currentUser } from "@/lib/auth.ts";
import { getSettings } from "@/lib/settings.ts";
import { one } from "@/lib/db.ts";
import { addDays, todayLocal } from "@/lib/dates.ts";
import { ACCESS, AMENITY_GROUPS, CANCELLATION, PROPERTY_TYPES, bedLabelLong, parseBeds, parseRooms, parseServices, servicePrice } from "@/lib/constants.ts";
import { partyFromParams } from "@/lib/party.ts";
import { Gallery } from "@/components/Gallery.tsx";
import { StayChooser } from "@/components/StayChooser.tsx";
import { ShareButtons } from "@/components/ShareButtons.tsx";
import { siteUrl } from "@/lib/email.ts";
import { PET_FEE_PER } from "@/lib/pricing.ts";
import { money } from "@/lib/money.ts";
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
    openGraph: { title: `${p.title} · Sevgio Stays`, description: p.description.slice(0, 160), url: `/stays/${p.slug}`, type: "website", ...(photos[0] ? { images: [{ url: photoUrl(photos[0].id), alt: p.title }] } : {}) },
    twitter: { card: photos[0] ? "summary_large_image" : "summary", title: `${p.title} · Sevgio Stays` },
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
  const demand = p.smart_pricing || linked.rooms.some(r => r.smart_pricing) ? demandForClient(await demandBetween()) : undefined;
  const hostFirst = (host?.name || "your host").split(" ")[0];
  const bookable = p.status === "published";
  const beds = parseBeds(p.beds_detail);
  // Bedroom cards: the host's room-by-room details, or (for a whole house) its separately listed rooms.
  const myPhotos = new Set(photos.map(ph => ph.id));
  const rooms: { name: string; sqft: number | null; beds: ReturnType<typeof parseBeds>; note: string; img: string | null; href?: string }[] = parseRooms(p.rooms_detail).length
    ? parseRooms(p.rooms_detail).map(r => ({ ...r, img: r.photo && myPhotos.has(r.photo) ? photoUrl(r.photo) : null }))
    : linked.rooms.map(r => ({ name: r.title.split(/ [-\u2013\u2014] /).length > 1 ? r.title.split(/ [-\u2013\u2014] /).slice(1).join(" - ") : r.title, sqft: null, beds: parseBeds(r.beds_detail), img: r.cover_id ? photoUrl(r.cover_id) : null,
        note: `${r.bathroom_type === "shared" ? "Shared" : "Private"} bathroom · also bookable on its own`, href: `/stays/${r.slug}` }));

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
            <span className="spacer" />
            <ShareButtons url={`${siteUrl()}/stays/${p.slug}`} title={p.title} />
          </div>
        </div>
      </div>
      <StayChooser current={p} house={linked.parent ?? p} rooms={linked.parent ? [...linked.siblings, p].sort((a, b) => a.nightly_price_cents - b.nightly_price_cents) : linked.rooms} sp={sp} />
      <Gallery photos={photos.map(ph => ({ id: ph.id, caption: ph.caption }))} title={p.title} />

      <BookingProvider
        p={{ slug: p.slug, nightly_price_cents: p.nightly_price_cents, cleaning_fee_cents: p.cleaning_fee_cents, min_nights: p.min_nights, max_nights: p.max_nights, max_guests: p.max_guests, booking_mode: p.booking_mode,
          base_occupancy: p.base_occupancy, extra_guest_fee_cents: p.extra_guest_fee_cents, fewer_guest_discount_percent: Number(p.fewer_guest_discount_percent), weekly_discount_percent: Number(p.weekly_discount_percent), monthly_discount_percent: Number(p.monthly_discount_percent), children_free_age: p.children_free_age,
          pets_allowed: p.amenities.includes("pets"), pet_fee_cents: p.pet_fee_cents, pet_fee_per: p.pet_fee_per,
          services: parseServices(p.services), security_deposit_cents: p.security_deposit_cents,
          monthly_price_cents: p.monthly_price_cents, smart_pricing: p.smart_pricing, min_price_cents: p.min_price_cents, max_price_cents: p.max_price_cents, demand }}
        today={today}
        unavailable={taken}
        taxPercent={settings.tax_percent}
        initial={{ ci: sp.ci || "", co: sp.co || "", party: partyFromParams(sp) }}
        bookable={bookable}
      >
        <div className="detail-grid">
          <div className="detail-main">
            <div className="facts">
              <div className="fact"><b>{p.max_guests}</b><span>guests</span></div>
              {rooms.length > 0
                ? <a className="fact fact-link" href="#rooms" title="See each bedroom"><b>{p.bedrooms}</b><span>bedroom{p.bedrooms === 1 ? "" : "s"} ›</span></a>
                : <div className="fact"><b>{p.bedrooms}</b><span>bedroom{p.bedrooms === 1 ? "" : "s"}</span></div>}
              <div className="fact"><b>{p.beds}</b><span>bed{p.beds === 1 ? "" : "s"}</span></div>
              <div className="fact"><b>{p.bathrooms}{p.half_bathrooms ? ` + ${p.half_bathrooms} half` : ""}</b><span>{p.bathroom_type === "shared" ? "shared" : "private"} bathroom{p.bathrooms + p.half_bathrooms === 1 ? "" : "s"}</span></div>
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
            {(rooms.length > 0 || beds.length > 0) && (
              <section id="rooms" className="rooms-section">
                <h2>Where you'll sleep</h2>
                {rooms.length > 0 && (
                  <div className="room-cards">
                    {rooms.map((r, i) => {
                      const card = (
                        <>
                          <div className="room-pic">{r.img ? <img src={r.img} alt={r.name} loading="lazy" /> : <span aria-hidden>🛏️</span>}</div>
                          <div className="room-body">
                            <h3>{r.name}</h3>
                            <ul className="room-beds">{r.beds.map((b, k) => <li key={k}>{bedLabelLong(b)}</li>)}</ul>
                            {r.sqft && <p className="room-size">{r.sqft} sq ft</p>}
                            {r.note && <p className="muted">{r.note}</p>}
                          </div>
                        </>
                      );
                      return r.href ? <Link key={i} className="room-card" href={r.href}>{card}</Link> : <article key={i} className="room-card">{card}</article>;
                    })}
                  </div>
                )}
                {beds.length > 0 && <><h3 style={{ marginTop: rooms.length ? 18 : 0 }}>All beds</h3><ul className="amen">{beds.map((b, i) => <li key={i}><Check />{bedLabelLong(b)}</li>)}</ul></>}
              </section>
            )}
            <section>
              <h2>Good to know</h2>
              <dl className="kv">
                {p.shared_spaces && <><dt>Shared spaces</dt><dd style={{ fontWeight: 400 }}>{p.shared_spaces}</dd></>}
                <dt>Bathroom</dt><dd>{p.bathroom_type === "shared" ? "Shared with other guests" : "Private"}{p.half_bathrooms ? ` · plus ${p.half_bathrooms} half bath${p.half_bathrooms > 1 ? "s" : ""}` : ""}</dd>
                <dt>Kitchen</dt><dd>{ACCESS[p.kitchen_access]}</dd>
                <dt>Laundry</dt><dd>{ACCESS[p.laundry_access]}</dd>
                {p.stairs_info && <><dt>Stairs</dt><dd style={{ fontWeight: 400 }}>{p.stairs_info}</dd></>}
                <dt>Security cameras</dt><dd style={{ fontWeight: 400 }}>{p.has_exterior_cameras ? `Exterior cameras: ${p.camera_locations || "see host for locations"}. No cameras inside.` : "No security cameras on the property."}</dd>
                <dt>Children</dt><dd style={{ fontWeight: 400 }}>{p.children_free_age > 0 ? `Children aged ${p.children_free_age} and under stay free.` : "Infants under 1 stay free."}</dd>
              </dl>
            </section>
            {p.amenities.length > 0 && (
              <section>
                <h2>Amenities</h2>
                {AMENITY_GROUPS.map(g => {
                  const have = Object.keys(g.items).filter(k => p.amenities.includes(k));
                  return have.length ? (
                    <div key={g.name} className="stack" style={{ gap: 8, marginBottom: 8 }}>
                      <h3 style={{ fontSize: 15 }}>{g.name}</h3>
                      <ul className="amen">{have.map(a => <li key={a}><Check />{g.items[a]}</li>)}</ul>
                    </div>
                  ) : null;
                })}
              </section>
            )}
            <AvailabilitySection />
            {linked.rooms.length > 0 && (
              <section>
                <h2>Just need a room?</h2>
                <p className="muted">You can also book individual rooms in this home. When a room is booked, the whole home isn't available for those dates.</p>
                <div className="cards">{linked.rooms.map(r => <PropertyCard key={r.id} p={r} demand={demand} taxPercent={settings.tax_percent} ci={sp.ci} co={sp.co} guests={Number(sp.guests) || undefined} />)}</div>
              </section>
            )}
            {parseServices(p.services).length > 0 && (
              <section>
                <h2>Extra services</h2>
                <p className="muted">Add any of these when you book. Your host arranges them for you.</p>
                <ul className="extras-list">
                  {parseServices(p.services).map(x => <li key={x.key}><b>{x.name}</b><span className="mono">{servicePrice(x, money)}</span>{x.note && <span className="hint">{x.note}</span>}</li>)}
                </ul>
              </section>
            )}
            <section>
              <h2>House rules</h2>
              <dl className="kv">
                <dt>Check-in</dt><dd>After {p.check_in_time}</dd>
                <dt>Check-out</dt><dd>Before {p.check_out_time}</dd>
                <dt>Minimum stay</dt><dd>{p.min_nights} night{p.min_nights > 1 ? "s" : ""}</dd>
                <dt>Maximum guests</dt><dd>{p.max_guests}</dd>
                {p.security_deposit_cents > 0 && <><dt>Security deposit</dt><dd>{money(p.security_deposit_cents)}, refundable after check-out</dd></>}
                <dt>Pets</dt><dd>{!p.amenities.includes("pets") ? "Not allowed" : p.pet_fee_cents ? `Allowed · ${money(p.pet_fee_cents)} ${PET_FEE_PER[p.pet_fee_per]}` : "Allowed · free"}</dd>
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

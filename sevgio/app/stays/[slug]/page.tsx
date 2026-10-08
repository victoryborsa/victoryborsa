import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { propertyBySlug, photosFor, photoUrl, linkedListings } from "@/lib/queries.ts";
import { PropertyCard } from "@/components/PropertyCard.tsx";
import { demandBetween, demandForClient, manualPrices } from "@/lib/demand.ts";
import { unavailableNights } from "@/lib/bookings.ts";
import { currentUser } from "@/lib/auth.ts";
import { getSettings } from "@/lib/settings.ts";
import { one } from "@/lib/db.ts";
import { addDays, todayLocal } from "@/lib/dates.ts";
import { placeFull, ACCESS, AMENITY_FILTERS, AMENITY_GROUPS, CANCELLATION, PROPERTY_TYPES, bedLabelLong, parseBeds, parseRooms, parseServices, servicePrice } from "@/lib/constants.ts";
import { partyFromParams } from "@/lib/party.ts";
import { Gallery } from "@/components/Gallery.tsx";
import { StayChooser } from "@/components/StayChooser.tsx";
import { ShareButtons } from "@/components/ShareButtons.tsx";
import { ListingStats } from "@/components/ListingStats.tsx";
import { listingStats, VISITOR_COOKIE } from "@/lib/listing-stats.ts";
import { cookies } from "next/headers";
import { siteUrl } from "@/lib/email.ts";
import { money } from "@/lib/money.ts";
import { AvailabilitySection, BookingPanel, BookingProvider, MobileBookBar } from "@/components/booking.tsx";
import { Check, Rating } from "@/components/ui.tsx";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { askHostAction } from "@/app/actions/messages.ts";
import { priceNote, isWebUrl, isPdf, availableLabel, firstFreeStart } from "@/lib/corporate.ts";
import { UTILITIES } from "@/lib/constants.ts";
import { Icon } from "@/components/Icon.tsx";
import { Thumb } from "@/components/Thumb.tsx";
import { AMENITY_THUMB, serviceThumb } from "@/lib/thumbs.ts";
import type { Property } from "@/lib/bookings.ts";
import { guestDescription, guestRules, policies } from "@/lib/policies.ts";
import { JsonLd, breadcrumbLd, listingLd } from "@/lib/seo.tsx";

/** Long-term lease homes: rent, fees and Request / Apply buttons in place of the booking calendar. */
function LeasePanel({ p, phone, freeFrom }: { p: Property; phone: string; freeFrom: string | null }) {
  const fees: [string, number, string][] = [
    ["Security deposit", p.corp_deposit_cents || 0, ""],
    ["Application fee", p.corp_app_fee_cents || 0, "per household"],
    ["Cleaning fee", p.corp_cleaning_cents || 0, "one time"],
    // The pet fee only appears when the Pets setting allows pets, so the page never contradicts itself.
    ["Pet fee", p.amenities.includes("pets") ? p.corp_pet_fee_cents || 0 : 0, "non-refundable, if you bring a pet"],
  ];
  const apply = p.corp_apply_url && isWebUrl(p.corp_apply_url) ? p.corp_apply_url : "";
  return (
    <aside className="panel sticky lease-panel" aria-label="Rent this home" id="book">
      <div className="panel-price"><b>{money(p.corp_monthly_cents || 0)}</b><span className="muted">/ month</span></div>
      <p className="lease-note">{priceNote(p)}</p>
      {p.utilities && UTILITIES[p.utilities] && <p className={`util-line ${p.utilities}`}><Icon name="bolt" size={14} />{UTILITIES[p.utilities]}</p>}
      <p className={`ch-avail${freeFrom === null || freeFrom > todayLocal() ? "" : " now"}`}>{availableLabel(freeFrom)}</p>
      <dl className="ch-fees">
        {fees.filter(([, c]) => c > 0).map(([k, c, sub]) => <div key={k}><dt>{k}{sub && <small>{sub}</small>}</dt><dd>{money(c)}</dd></div>)}
      </dl>
      <div className="lease-actions">
        <Link className="btn btn-primary" href={`/corporate-housing?home=${p.id}#request`}>Request this home</Link>
        {apply && (isPdf(apply)
          ? <a className="btn btn-ghost" href={apply} download>Download application (PDF)</a>
          : <a className="btn btn-ghost" href={apply} target="_blank" rel="noopener noreferrer">Apply now</a>)}
      </div>
      {phone && <p className="hint">Questions? Text or call <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a></p>}
    </aside>
  );
}

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
    description: guestDescription(p).replace(/\s+/g, " ").slice(0, 160),
    alternates: { canonical: `/stays/${p.slug}` },
    openGraph: { title: `${p.title} · Sevgio`, description: p.description.slice(0, 160), url: `/stays/${p.slug}`, type: "website", ...(photos[0] ? { images: [{ url: photoUrl(photos[0].id), alt: p.title }] } : {}) },
    twitter: { card: photos[0] ? "summary_large_image" : "summary", title: `${p.title} · Sevgio` },
  };
}

export default async function StayPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const sp = await searchParams;
  const p = await load(slug);
  if (!p) notFound();
  const today = todayLocal();
  const [photos, taken, settings, host, user, linked, stats] = await Promise.all([
    photosFor(p.id),
    unavailableNights(p.id, today, addDays(today, 560)),
    getSettings(),
    one<{ name: string }>("SELECT name FROM users WHERE id = $1", [p.host_id]),
    currentUser(),
    linkedListings(p),
    listingStats(p.id, (await cookies()).get(VISITOR_COOKIE)?.value),
  ]);
  const demand = p.smart_pricing || linked.rooms.some(r => r.smart_pricing) ? demandForClient(await demandBetween()) : undefined;
  // Nights the host priced by hand, so the calendar and the price summary match checkout night by night.
  const prices = await manualPrices([p.id, ...linked.rooms.map(r => r.id)], today, addDays(today, 560));
  const hostFirst = (host?.name || "your host").split(" ")[0];
  const bookable = p.status === "published";
  // House rules and policies all come from the listing's own fields (one master record).
  const pol = policies(p), rules = guestRules(p), about = guestDescription(p);
  const beds = parseBeds(p.beds_detail);
  // Bedroom cards: the host's room-by-room details, or (for a whole house) its separately listed rooms.
  const myPhotos = new Set(photos.map(ph => ph.id));
  const rooms: { name: string; sqft: number | null; beds: ReturnType<typeof parseBeds>; note: string; img: string | null; href?: string }[] = parseRooms(p.rooms_detail).length
    ? parseRooms(p.rooms_detail).map(r => ({ ...r, img: r.photo && myPhotos.has(r.photo) ? photoUrl(r.photo) : null }))
    : linked.rooms.map(r => ({ name: r.title.split(/ [-\u2013\u2014] /).length > 1 ? r.title.split(/ [-\u2013\u2014] /).slice(1).join(" - ") : r.title, sqft: null, beds: parseBeds(r.beds_detail), img: r.cover_id ? photoUrl(r.cover_id) : null,
        note: `${r.bathroom_type === "shared" ? "Shared" : "Private"} bathroom · also bookable on its own`, href: `/stays/${r.slug}` }));

  // Home › Stays › (the whole house, for a room in it) › this stay.
  const crumbs = [{ name: "Home", href: "/" }, { name: "Stays", href: "/stays" }, ...(linked.parent ? [{ name: linked.parent.title, href: `/stays/${linked.parent.slug}` }] : []), { name: p.title, href: `/stays/${p.slug}` }];

  return (
    <div className="wrap has-mobile-book">
      {bookable && <JsonLd data={listingLd(siteUrl(), p, photos.slice(0, 5).map(ph => siteUrl() + photoUrl(ph.id)))} />}
      {bookable && <JsonLd data={breadcrumbLd(siteUrl(), crumbs.map(c => ({ name: c.name, path: c.href })))} />}
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          {crumbs.map((c, i) => <li key={c.href}>{i < crumbs.length - 1 ? <Link href={c.href}>{c.name}</Link> : <span aria-current="page">{c.name}</span>}</li>)}
        </ol>
      </nav>
      {!bookable && <div className="notice warn" style={{ marginBottom: 12 }}>Preview: this listing is <b>{p.status}</b> and not visible to guests.</div>}
      <div className="row" style={{ alignItems: "end", marginBottom: 16 }}>
        <div className="stack" style={{ gap: 6, flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: "clamp(26px,4vw,36px)" }}>{p.title}</h1>
          <div className="row" style={{ gap: "8px 16px" }}>
            <Rating rating={p.rating} count={p.review_count} since={p.created_at} />
            <span className="pill neutral">{PROPERTY_TYPES[p.property_type] || "Home"}</span>
            <span className="muted">{placeFull(p.city, p.area)}</span>
            {host?.name && <span className="muted">Hosted by <b style={{ color: "var(--ink)" }}>{hostFirst}</b></span>}
            {p.corp_lease_only ? <span className="pill neutral">Long-term lease</span> : p.booking_mode === "instant" ? <span className="pill ok">Instant booking</span> : <span className="pill warn">Request to book</span>}
            <span className="spacer" />
            <ShareButtons url={`${siteUrl()}/stays/${p.slug}`} title={p.title} statsId={bookable ? p.id : undefined} />
          </div>
        </div>
      </div>
      <ListingStats id={p.id} initial={stats} live={bookable} />
      <StayChooser current={p} house={linked.parent ?? p} rooms={linked.parent ? [...linked.siblings, p].sort((a, b) => a.nightly_price_cents - b.nightly_price_cents) : linked.rooms} sp={sp} />
      <Gallery photos={photos.map(ph => ({ id: ph.id, caption: ph.caption }))} title={p.title} />

      <BookingProvider
        p={{ slug: p.slug, nightly_price_cents: p.nightly_price_cents, cleaning_fee_cents: p.cleaning_fee_cents, min_nights: p.min_nights, max_nights: p.max_nights, max_guests: p.max_guests, booking_mode: p.booking_mode,
          base_occupancy: p.base_occupancy, extra_guest_fee_cents: p.extra_guest_fee_cents, fewer_guest_discount_percent: Number(p.fewer_guest_discount_percent), weekly_discount_percent: Number(p.weekly_discount_percent), monthly_discount_percent: Number(p.monthly_discount_percent), children_free_age: p.children_free_age,
          pets_allowed: p.amenities.includes("pets"), pet_fee_cents: p.pet_fee_cents, pet_fee_per: p.pet_fee_per,
          services: parseServices(p.services), security_deposit_cents: p.security_deposit_cents, utilities: p.utilities || "",
          monthly_price_cents: p.monthly_price_cents, smart_pricing: p.smart_pricing, min_price_cents: p.min_price_cents, max_price_cents: p.max_price_cents, demand, prices: prices[p.id] }}
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
              {p.corp_furnished === false ? <div className="fact"><b className="fact-word">Unfurnished</b><span>bring your own furniture</span></div> : <div className="fact"><b>{p.beds}</b><span>bed{p.beds === 1 ? "" : "s"}</span></div>}
              <div className="fact"><b>{p.bathrooms}{p.half_bathrooms ? ` + ${p.half_bathrooms} half` : ""}</b><span>{p.bathroom_type === "shared" ? "shared" : "private"} bathroom{p.bathrooms + p.half_bathrooms === 1 ? "" : "s"}</span></div>
            </div>
            {linked.parent && (
              <div className="notice info">
                <div>This is a private room in <Link href={`/stays/${linked.parent.slug}`}>{linked.parent.title}</Link>. Traveling with a bigger group? You can book the whole home instead.</div>
              </div>
            )}
            <section>
              <h2>About this {(PROPERTY_TYPES[p.property_type] || "home").toLowerCase()}</h2>
              <p className="prose">{about}</p>
              <p className="muted">Hosted by {host?.name}. {placeFull(p.city, p.area)}. The exact address is shared once your {p.corp_lease_only ? "application is approved" : "booking is confirmed"}.</p>
            </section>
            {p.corp_furnished !== false && (rooms.length > 0 || beds.length > 0) && (
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
                {!p.corp_lease_only && <><dt>Children</dt><dd style={{ fontWeight: 400 }}>{p.children_free_age > 0 ? `Children aged ${p.children_free_age} and under stay free.` : "Infants under 1 stay free."}</dd></>}
              </dl>
            </section>
            {p.amenities.length > 0 && (
              <section>
                <h2>Amenities</h2>
                {(() => {
                  const top = AMENITY_THUMB.filter(([k]) => AMENITY_FILTERS[k].keys.some(a => p.amenities.includes(a)));
                  return top.length ? <ul className="amen-top" aria-label="Popular amenities">{top.map(([k, t]) => <li key={k}><Thumb name={t} size={40} />{AMENITY_FILTERS[k].label}</li>)}</ul> : null;
                })()}
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
            {!p.corp_lease_only && <AvailabilitySection />}
            {linked.rooms.length > 0 && !p.corp_lease_only && (
              <section>
                <h2>Just need a room?</h2>
                <p className="muted">You can also book individual rooms in this home. When a room is booked, the whole home isn't available for those dates.</p>
                <div className="cards">{linked.rooms.map(r => <PropertyCard key={r.id} p={r} demand={demand} prices={prices[r.id]} taxPercent={settings.tax_percent} ci={sp.ci} co={sp.co} guests={Number(sp.guests) || undefined} />)}</div>
              </section>
            )}
            {parseServices(p.services).length > 0 && (
              <section>
                <h2>Extra services</h2>
                <p className="muted">Add any of these when you book. Your host arranges them for you.</p>
                <ul className="extras-list">
                  {parseServices(p.services).map(x => <li key={x.key}><Thumb name={serviceThumb(x.key)} size={44} /><b>{x.name}</b><span className="mono">{servicePrice(x, money)}</span>{x.note && <span className="hint">{x.note}</span>}</li>)}
                </ul>
              </section>
            )}
            <section>
              <h2>House rules</h2>
              <dl className="kv">
                {p.corp_lease_only ? <><dt>Lease</dt><dd>Long-term lease{p.corp_furnished === false ? ", unfurnished" : ""}</dd></> : <>
                <dt>Check-in</dt><dd>{pol.checkIn}</dd>
                <dt>Check-out</dt><dd>{pol.checkOut}</dd>
                <dt>Minimum stay</dt><dd>{pol.minStay}</dd>
                <dt>Cleaning fee</dt><dd>{pol.cleaningFee}</dd></>}
                <dt>Maximum guests</dt><dd>{pol.maxGuests}</dd>
                <dt>Security deposit</dt><dd>{pol.deposit}</dd>
                <dt>Pets</dt><dd>{pol.pets}</dd>
                <dt>Smoking</dt><dd>{pol.smoking}</dd>
                <dt>Parking</dt><dd>{pol.parking}</dd>
                <dt>Security cameras</dt><dd>{pol.cameras}</dd>
              </dl>
              {rules.length > 0 && <ul className="rules">{rules.map((r, i) => <li key={i}>{r}</li>)}</ul>}
            </section>
            {!p.corp_lease_only && <section>
              <h2>Cancellation policy</h2>
              <p><span className="pill neutral">{CANCELLATION[p.cancellation_policy]?.label}</span></p>
              <p className="prose">{CANCELLATION[p.cancellation_policy]?.text}</p>
            </section>}
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
          {p.corp_lease_only ? <LeasePanel p={p} phone={settings.contact_phone} freeFrom={await firstFreeStart(p.id, p.corp_available_from ?? null, Math.max(30, p.min_nights))} /> : <BookingPanel paymentNote={settings.payment_note} />}
        </div>
        {p.corp_lease_only
          ? <div className="mobile-book"><div style={{ flex: 1, minWidth: 0 }}><b className="mono">{money(p.corp_monthly_cents || 0)}</b> <span className="muted">/ month</span></div><Link className="btn btn-primary" href={`/corporate-housing?home=${p.id}#request`}>Request this home</Link></div>
          : <MobileBookBar />}
      </BookingProvider>
    </div>
  );
}

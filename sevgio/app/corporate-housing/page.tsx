import type { Metadata } from "next";
import Link from "next/link";
import { corporateHomes, withRealAvailability, availableLabel, isFurnishedFinderUrl, isWebUrl, isPdf, priceNote, type CorpHome } from "@/lib/corporate.ts";
import { photoUrl } from "@/lib/queries.ts";
import { money } from "@/lib/money.ts";
import { getSettings } from "@/lib/settings.ts";
import { currentUser } from "@/lib/auth.ts";
import { siteUrl } from "@/lib/email.ts";
import { mailUrl, telUrl } from "@/lib/links.ts";
import { todayLocal } from "@/lib/dates.ts";
import { Icon, type IconName } from "@/components/Icon.tsx";
import { UTILITIES } from "@/lib/constants.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { CopyField } from "@/components/CopyField.tsx";
import { PickHome } from "@/components/PickHome.tsx";
import { DatePicker } from "@/components/DatePicker.tsx";
import { corporateRequestAction } from "@/app/actions/messages.ts";
import { JsonLd, businessLd } from "@/lib/seo.tsx";

export const metadata: Metadata = {
  alternates: { canonical: "/corporate-housing" },
  openGraph: { title: "Furnished & Corporate Housing in Pittsburgh · Sevgio", url: "/corporate-housing", description: "Fully furnished monthly homes in Pittsburgh for travel nurses, traveling physicians, corporate teams, relocating employees and extended stays." },
  title: "Furnished & Corporate Housing in Pittsburgh",
  description: "Fully furnished monthly homes in Pittsburgh and Indiana, PA for travel nurses, doctors, corporate teams and extended stays. One fixed price, all inclusive.",
};
export const dynamic = "force-dynamic";

const WHO: [IconName, string][] = [["stethoscope", "Travel nurses"], ["check", "Doctors and residents"], ["briefcase", "Corporate teams"], ["wrench", "Contractors"], ["family", "Relocating families"]];

const INCLUDED: [IconName, string, string][] = [
  ["sofa", "Fully furnished", "Beds, sofas, desk and dining set. Bring your suitcase."],
  ["bolt", "All utilities", "Electric, gas, water, sewer and trash."],
  ["wifi", "Fast Wi-Fi", "Ready for charting, video calls and streaming."],
  ["kitchen", "Stocked kitchen", "Cookware, dishes, coffee maker and basics."],
  ["washer", "Washer and dryer", "Laundry in the home."],
  ["calendar", "Flexible stays", "From 1 month up to 12 months."],
];

const LENGTHS = ["1 month", "2 months", "3 months (13 weeks)", "6 months", "12 months", "Not sure yet"];

const isRoom = (p: CorpHome) => !!p.parent_id || p.property_type === "room";

function bathText(p: CorpHome) {
  const full = Number(p.bathrooms), half = Number(p.half_bathrooms || 0);
  return `${full} bath${full === 1 ? "" : "s"}${half ? ` + ${half} half` : ""}`;
}

function HomeCard({ p, today }: { p: CorpHome & { free_from: string | null }; today: string }) {
  const ff = isFurnishedFinderUrl(p.furnished_finder_url) ? p.furnished_finder_url : "";
  const avail = availableLabel(p.free_from, today);
  return (
    <article className="ch-home">
      <Link href={`/stays/${p.slug}`} className="ch-ph" tabIndex={-1} aria-hidden="true">
        {p.cover_id ? <img src={photoUrl(p.cover_id, "large")} alt={p.title} loading="lazy" decoding="async" width={640} height={480} /> : <span className="noph">Photos coming soon</span>}
      </Link>
      <div className="ch-body">
        <p className={`ch-avail${avail === "Available now" ? " now" : ""}`}>{avail}</p>
        <h3><Link href={`/stays/${p.slug}`}>{p.title}</Link></h3>
        <p className="muted">{[p.area, p.city].filter(Boolean).join(", ")}</p>
        {isRoom(p)
          ? <p className="ch-facts">Private room{p.parent_title ? ` in ${p.parent_title}` : ""} <span aria-hidden="true">/</span> {p.bathroom_type === "shared" ? "shared bath" : "private bath"} <span aria-hidden="true">/</span> sleeps {p.max_guests}</p>
          : <p className="ch-facts">{p.corp_furnished ? "Entire home" : "Unfurnished home"} <span aria-hidden="true">/</span> {p.bedrooms} bedroom{p.bedrooms === 1 ? "" : "s"} <span aria-hidden="true">/</span> {bathText(p)}{p.corp_furnished && <> <span aria-hidden="true">/</span> sleeps {p.max_guests}</>}</p>}
        <div className="ch-rate">
          <p><b>{money(p.corp_monthly_cents)}</b> <span>per month</span></p>
          <p className="ch-incl">{priceNote(p)}</p>
          {UTILITIES[p.utilities] && <p className={`util-line ${p.utilities}`}><Icon name="bolt" size={14} />{UTILITIES[p.utilities]}</p>}
        </div>
        <dl className="ch-fees">
          <div><dt>Security deposit</dt><dd>{p.corp_deposit_cents ? money(p.corp_deposit_cents) : "None"}</dd></div>
          {p.corp_app_fee_cents > 0 && <div><dt>Application fee <small>per household</small></dt><dd>{money(p.corp_app_fee_cents)}</dd></div>}
          {(p.corp_furnished || p.corp_cleaning_cents > 0) && <div><dt>Cleaning fee <small>one time</small></dt><dd>{p.corp_cleaning_cents ? money(p.corp_cleaning_cents) : "None"}</dd></div>}
          {p.corp_pet_fee_cents > 0 && <div><dt>Pet fee <small>non-refundable, if you bring a pet</small></dt><dd>{money(p.corp_pet_fee_cents)}</dd></div>}
        </dl>
        <div className="ch-links">
          <Link className="btn btn-primary btn-sm" href={`/stays/${p.slug}`}>View home</Link>
          <a className="btn btn-ghost btn-sm" href="#request" data-home={p.id}>Request this {isRoom(p) ? "room" : "home"}</a>
          {p.corp_apply_url && isWebUrl(p.corp_apply_url) && (isPdf(p.corp_apply_url)
            ? <a className="ch-ff" href={p.corp_apply_url} download>Download application (PDF)</a>
            : <a className="ch-ff" href={p.corp_apply_url} target="_blank" rel="noopener noreferrer">Apply now <Icon name="out" size={14} /></a>)}
          {ff && <a className="ch-ff" href={ff} target="_blank" rel="noopener noreferrer">Furnished Finder <Icon name="out" size={14} /></a>}
        </div>
      </div>
    </article>
  );
}

export default async function CorporateHousing({ searchParams }: { searchParams: Promise<{ home?: string }> }) {
  const [homes, s, u, sp] = await Promise.all([corporateHomes().then(withRealAvailability), getSettings(), currentUser(), searchParams]);
  const picked = homes.some(h => h.id === sp.home) ? sp.home : "";
  const anyUnfurnished = homes.some(h => !h.corp_furnished);
  const today = todayLocal();
  const pageUrl = siteUrl() + "/corporate-housing";
  return (
    <div className="ch theme-light">
      <JsonLd data={businessLd(siteUrl(), { email: s.contact_email, phone: s.contact_phone })} />
      <section className="wrap ch-hero">
        <div className="ch-hero-text">
          <p className="eyebrow">Furnished and corporate housing</p>
          <h1>A furnished home for your next assignment</h1>
          <p className="lede">{anyUnfurnished
            ? "Furnished monthly homes with one all-inclusive price, plus unfurnished homes for longer leases, in Pittsburgh and Indiana, PA."
            : "Monthly homes in Pittsburgh and Indiana, PA. One fixed price covers rent, utilities and Wi-Fi."}</p>
          <div className="ch-cta">
            <a className="btn btn-primary" href="#request">Request housing</a>
            <a className="btn btn-ghost" href="#homes">See homes and rooms</a>
          </div>
        </div>
        <img className="ch-hero-img" src="/img/pittsburgh-skyline.jpg" alt="The Pittsburgh skyline over the rivers" width={1600} height={1067} fetchPriority="high" />
      </section>

      <section className="wrap ch-who" aria-label="Who we host">
        <ul>{WHO.map(([ic, label]) => <li key={label}><Icon name={ic} size={20} />{label}</li>)}</ul>
      </section>

      <section className="wrap" id="homes">
        <h2 className="ch-h2">Available homes and rooms</h2>
        <p className="muted ch-sub">{anyUnfurnished
          ? "Furnished homes and private rooms with one all-inclusive monthly price, plus unfurnished homes for longer leases."
          : "Entire homes and private rooms, ready to move in. The monthly price is all you pay each month."}</p>
        {homes.length ? (
          <div className="ch-homes">{homes.map(p => <HomeCard key={p.id} p={p} today={today} />)}</div>
        ) : (
          <div className="empty"><h3>New homes are being added</h3><p className="muted">Send a request below and we'll tell you what's open for your dates.</p></div>
        )}
      </section>

      <section className="ch-band">
        <div className="wrap">
          <h2 className="ch-h2">One fixed price. All inclusive.</h2>
          <p className="ch-sub">{anyUnfurnished ? "Every furnished home and room includes all of this in the monthly price." : "No utility bills, no setup, no surprises. Just the monthly price."}</p>
          <ul className="ch-inc">
            {INCLUDED.map(([ic, t, d]) => <li key={t}><span className="ch-inc-ic"><Icon name={ic} size={22} /></span><span><b>{t}</b><span>{d}</span></span></li>)}
          </ul>
        </div>
      </section>

      <section className="wrap ch-biz">
        <div>
          <h2 className="ch-h2">For housing coordinators and companies</h2>
          <ul className="ch-biz-list">
            <li><Icon name="receipt" size={20} />Monthly invoices and receipts for reimbursement</li>
            <li><Icon name="buildings" size={20} />Company or agency billing on request</li>
            <li><Icon name="key" size={20} />Self check-in, so late arrivals after a shift are easy</li>
            <li><Icon name="talk" size={20} />One local contact for every home</li>
          </ul>
        </div>
        <div className="ch-share">
          <p><b>Share this page</b></p>
          <p className="muted">Send it to your recruiter, placement team or traveler.</p>
          <CopyField value={pageUrl} label="Link to this page" />
        </div>
      </section>

      <section className="wrap" id="request">
        <h2 className="ch-h2">Tell us what you need</h2>
        <p className="muted ch-sub">We reply within 24 hours with the homes that fit your dates.</p>
        <ActionForm action={corporateRequestAction} className="ch-form" resetOnOk>
          <label className="field"><span>Your name</span><input className="input" name="name" autoComplete="name" defaultValue={u?.name} required /></label>
          <label className="field"><span>Company or agency (optional)</span><input className="input" name="company" autoComplete="organization" /></label>
          <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" defaultValue={u?.email} required /></label>
          <label className="field"><span>Phone (optional)</span><input className="input" name="phone" type="tel" autoComplete="tel" /></label>
          <label className="field"><span>I am a</span>
            <select className="input" name="who"><option>Travel nurse or medical staff</option><option>Doctor or resident</option><option>Corporate housing company</option><option>Company HR or relocation</option><option>Contractor or crew</option><option>Other</option></select>
          </label>
          <label className="field"><span>Home or room</span>
            <select className="input" name="home" id="ch-home" defaultValue={picked}><option value="">Any home or room that fits</option>{homes.map(p => <option key={p.id} value={p.id}>{p.title} ({money(p.corp_monthly_cents)}/mo)</option>)}</select>
          </label>
          <DatePicker name="movein" label="Move-in date" today={today} min={today} required />
          <label className="field"><span>Length of stay</span><select className="input" name="length">{LENGTHS.map(l => <option key={l}>{l}</option>)}</select></label>
          <label className="field"><span>Number of guests</span><input className="input" name="guests" type="number" min={1} max={20} defaultValue={1} /></label>
          <label className="field"><span>Pets</span><select className="input" name="pets"><option>No pets</option><option>Dog</option><option>Cat</option><option>Other</option></select></label>
          <label className="field"><span>Hospital, workplace or area (optional)</span><input className="input" name="area" /></label>
          <label className="field"><span>Monthly budget (optional)</span><input className="input" name="budget" inputMode="decimal" /></label>
          <label className="field full"><span>Anything else? (optional)</span><textarea className="input" name="notes" rows={3} /></label>
          <div style={{ position: "absolute", left: -9999 }} aria-hidden="true"><label>Leave empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <div className="full"><SubmitButton pendingText="Sending…">Send request</SubmitButton></div>
        </ActionForm>
        {(s.contact_email || s.contact_phone) && <p className="hint ch-direct">Prefer to talk? {s.contact_email && <a href={mailUrl(s.contact_email)}>{s.contact_email}</a>}{s.contact_email && s.contact_phone && " or "}{s.contact_phone && <a href={telUrl(s.contact_phone)}>{s.contact_phone}</a>}</p>}
      </section>
      <PickHome />
    </div>
  );
}

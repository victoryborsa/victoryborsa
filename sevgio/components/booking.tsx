"use client";
import Link from "next/link";
import { createContext, useContext, useMemo, useState } from "react";
import { Calendar, addDaysC } from "./Calendar.tsx";
import { DateRangePicker } from "./DatePicker.tsx";
import { dayLook, pickDay, validRange, type RangeRules } from "@/lib/date-range.ts";
import { PET_FEE_PER, baseLabel, priceTag, quote, type Party, type PricingInput } from "@/lib/pricing.ts";
import { UTILITIES, parseServices, servicePrice } from "@/lib/constants.ts";
import { money, moneyShort } from "@/lib/money.ts";
import { nightPrice } from "@/lib/smart-pricing.ts";
import { NightlyRates } from "./NightlyRates.tsx";

type P = PricingInput & { security_deposit_cents?: number; utilities?: string; slug: string; min_nights: number; max_nights: number; booking_mode: "instant" | "request"; children_free_age: number };
type Ctx = { p: P; today: string; taken: Set<string>; rules: RangeRules; taxPercent: number; ci: string; co: string; party: Party; msg: string; pick: (d: string) => void; setRange: (ci: string, co: string) => void; datesDone: () => void; clear: () => void; setParty: (p: Party) => void; bookable: boolean };
const BookingCtx = createContext<Ctx | null>(null);
const use = () => useContext(BookingCtx)!;
const MAX_PETS = 3;
const nights = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const fmt = (s: string) => (s ? new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "Add date");

export function BookingProvider({ p, today, unavailable, taxPercent, initial, bookable, children }: { p: P; today: string; unavailable: string[]; taxPercent: number; initial: { ci: string; co: string; party: Party }; bookable: boolean; children: React.ReactNode }) {
  const taken = useMemo(() => new Set(unavailable), [unavailable]);
  // The same rules as every date picker on the site: no past days, no booked nights inside a stay, the home's minimum and maximum stay.
  const rules: RangeRules = useMemo(() => ({ min: today, taken, minNights: p.min_nights, maxNights: p.max_nights }), [today, taken, p.min_nights, p.max_nights]);
  const validInitial = validRange({ ci: initial.ci, co: initial.co }, rules);
  const [ci, setCi] = useState(validInitial ? initial.ci : "");
  const [co, setCo] = useState(validInitial ? initial.co : "");
  const [party, setParty] = useState<Party>(() => {
    const adults = Math.min(Math.max(1, initial.party.adults || 2), p.max_guests);
    const children = Math.min(initial.party.children, p.max_guests - adults);
    return { adults, children, free_children: Math.min(initial.party.free_children, p.max_guests - adults - children), pets: p.pets_allowed ? Math.min(initial.party.pets || 0, MAX_PETS) : 0, services: (initial.party.services || []).filter(k => parseServices(p.services).some(x => x.key === k)) };
  });
  const [msg, setMsg] = useState(initial.ci && !validInitial ? "The dates from your search aren't available here. Pick new dates below." : "");

  // Dates done: move on to who's coming.
  const datesDone = () => {
    setTimeout(() => {
      const box = document.getElementById("party");
      if (!box) return;
      const r = box.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) box.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      box.querySelector<HTMLButtonElement>('button[aria-label^="More"]:not(:disabled)')?.focus({ preventScroll: true });
      box.classList.remove("flash"); void box.offsetWidth; box.classList.add("flash");
    }, 60);
  };
  const pick = (d: string) => {
    setMsg("");
    const n = pickDay(d, ci && !co ? "co" : "ci", { ci, co }, rules);
    setCi(n.ci); setCo(n.co);
    if (n.done) datesDone();
  };
  const setRange = (a: string, b: string) => { setMsg(""); setCi(a); setCo(b); };
  const value: Ctx = { p, today, taken, rules, taxPercent, ci, co, party, msg, pick, setRange, datesDone, clear: () => { setCi(""); setCo(""); setMsg(""); }, setParty, bookable };
  return <BookingCtx.Provider value={value}>{children}</BookingCtx.Provider>;
}

export function AvailabilitySection() {
  const { p, today, taken, rules, ci, co, msg, pick, clear } = use();
  const [hover, setHover] = useState("");
  const phase = ci && !co ? "co" : "ci";
  const dayState = (d: string) => {
    const look = dayLook(d, phase, { ci, co }, rules, hover);
    // Each open night shows its rate (Smart Pricing and nights the host priced by hand included), the same amount checkout charges.
    const price = d >= today && !taken.has(d) && !p.monthly_price_cents ? moneyShort(nightPrice(p, d, today)) : undefined;
    return { ...look, price };
  };
  return (
    <section id="availability">
      <div className="row"><h2>Availability</h2><span className="spacer" />{ci && <button type="button" className="linkbtn" onClick={clear}>Clear dates</button>}</div>
      <p className="muted" aria-live="polite">
        {!ci ? "Select your check-in date." : !co ? `Now select your check-out date. Minimum stay: ${p.min_nights} night${p.min_nights > 1 ? "s" : ""}.` : `${nights(ci, co)} nights: ${fmt(ci)} to ${fmt(co)}.`}
      </p>
      {msg && <div className="notice error" role="alert">{msg}</div>}
      <Calendar today={today} startMonth={ci || today} dayState={dayState} onPick={pick} onHover={phase === "co" ? setHover : undefined} boxed />
      <div className="legend cal-legend"><span><i className="lg-sel" />Your dates</span><span><i className="lg-free" />Available</span><span><i className="lg-taken" />Booked / unavailable</span>{!p.monthly_price_cents && <span>Prices are per night</span>}</div>
    </section>
  );
}

function useQuote() {
  const { p, ci, co, party, taxPercent, taken } = use();
  if (!ci || !co) return { pr: null, problem: "" };
  let problem = "";
  const n = nights(ci, co);
  if (n < p.min_nights) problem = `This home has a ${p.min_nights}-night minimum stay.`;
  else if (party.adults + party.children + party.free_children > p.max_guests) problem = `This home fits up to ${p.max_guests} guests, including children.`;
  else for (let d = ci; d < co; d = addDaysC(d, 1)) if (taken.has(d)) { problem = "Some of these nights are booked. Choose different dates."; break; }
  return { pr: quote(p, ci, co, taxPercent, party), problem };
}

export function bookHref(slug: string, ci: string, co: string, party: Party) {
  return `/book/${slug}?` + new URLSearchParams({ ci, co, adults: String(party.adults), children: String(party.children), infants: String(party.free_children), ...(party.pets ? { pets: String(party.pets) } : {}), ...(party.services?.length ? { svc: party.services.join(",") } : {}) });
}

/** Adults / children / young children (free) pickers. Total can't exceed the listing's maximum. */
function PartyPicker() {
  const { p, party, setParty } = use();
  const total = party.adults + party.children + party.free_children;
  const room = p.max_guests - total;
  const freeAge = p.children_free_age;
  const row = (key: "adults" | "children" | "free_children", label: string, hint: string, min: number) => (
    <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
      <div><div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div><div className="hint">{hint}</div></div>
      <div className="stepper" style={{ minWidth: 132 }}>
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={party[key] <= min} onClick={() => setParty({ ...party, [key]: party[key] - 1 })}>−</button>
        <output aria-label={label}>{party[key]}</output>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={room <= 0} onClick={() => setParty({ ...party, [key]: party[key] + 1 })}>+</button>
      </div>
    </div>
  );
  return (
    <div className="stack party" id="party" style={{ gap: 10 }} aria-label="Who's coming" role="group">
      {row("adults", "Adults", "Age 18+", 1)}
      {freeAge < 17 && row("children", "Children", `Ages ${freeAge + 1}-17`, 0)}
      {row("free_children", freeAge === 0 ? "Infants" : "Young children", freeAge === 0 ? "Under 1 · stay free" : `Ages 0-${freeAge} · stay free`, 0)}
      <span className="hint">Up to {p.max_guests} guests in total, including children.</span>
      {p.pets_allowed && (
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <div><div style={{ fontWeight: 600, fontSize: 14 }}>Pets</div><div className="hint">{p.pet_fee_cents ? `${money(p.pet_fee_cents)} ${PET_FEE_PER[p.pet_fee_per || "stay"]}` : "Pets stay free"}</div></div>
          <div className="stepper" style={{ minWidth: 132 }}>
            <button type="button" aria-label="Fewer pets" disabled={!party.pets} onClick={() => setParty({ ...party, pets: (party.pets || 0) - 1 })}>−</button>
            <output aria-label="Pets">{party.pets || 0}</output>
            <button type="button" aria-label="More pets" disabled={(party.pets || 0) >= MAX_PETS} onClick={() => setParty({ ...party, pets: (party.pets || 0) + 1 })}>+</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Extras the listing offers (airport pickup, city tour, …): ticking one adds it to the price. */
function ExtrasPicker() {
  const { p, party, setParty } = use();
  const list = parseServices(p.services);
  if (!list.length) return null;
  const on = new Set(party.services || []);
  const flip = (k: string) => setParty({ ...party, services: on.has(k) ? [...on].filter(x => x !== k) : [...on, k] });
  return (
    <fieldset className="extras">
      <legend>Add extras</legend>
      {list.map(x => (
        <label key={x.key} className="chk extra-item">
          <input type="checkbox" checked={on.has(x.key)} onChange={() => flip(x.key)} />
          <span><b>{x.name}</b> <span className="muted">{servicePrice(x, money)}</span>{x.note && <span className="hint" style={{ display: "block" }}>{x.note}</span>}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function BookingPanel({ paymentNote }: { paymentNote: string }) {
  const { p, ci, co, party, bookable, taxPercent, today, rules, setRange, datesDone } = use();
  const { pr, problem } = useQuote();
  const ready = !!(ci && co && pr && !problem && bookable);
  return (
    <aside className="panel sticky" aria-label="Book this home" id="book">
      <div className="panel-price"><b>{money(priceTag(p).cents)}</b><span className="muted">/ {priceTag(p).unit}{p.monthly_price_cents && p.utilities !== "tenant" ? " · all-inclusive" : ""}</span></div>
      {p.utilities && UTILITIES[p.utilities] && <p className={`util-line ${p.utilities}`}>{UTILITIES[p.utilities]}</p>}
      <DateRangePicker id="book-dates" today={today} min={rules.min} taken={rules.taken} minNights={rules.minNights} maxNights={rules.maxNights}
        value={{ ci, co }} onChange={v => setRange(v.ci, v.co)} onDone={datesDone} names={["", ""]} />
      <PartyPicker />
      <ExtrasPicker />
      {pr && !problem && (
        <table className="breakdown">
          <tbody>
            <tr><td>{baseLabel(pr, money, p)}{p.monthly_price_cents && <div className="hint">All-inclusive monthly rent</div>}{pr.smart && <div className="hint">Nightly prices follow demand in Pittsburgh</div>}<NightlyRates q={pr} />{pr.extraGuests > 0 ? <div className="hint">Includes {pr.extraGuests} extra guest{pr.extraGuests > 1 ? "s" : ""}</div> : pr.fewerGuests > 0 && !pr.smart && pr.nightly < pr.baseNightly ? <div className="hint">Smaller-group price</div> : null}</td><td>{money(pr.base)}</td></tr>
            {pr.discount > 0 && <tr><td>{pr.discountLabel}</td><td>−{money(pr.discount)}</td></tr>}
            {pr.cleaning > 0 && <tr><td>Cleaning fee</td><td>{money(pr.cleaning)}</td></tr>}
            {pr.petFee > 0 && <tr><td>Pet fee ({pr.pets} pet{pr.pets === 1 ? "" : "s"})</td><td>{money(pr.petFee)}</td></tr>}
            {pr.extras.map(x => <tr key={x.key}><td>{x.name}{x.qty > 1 && x.total ? ` × ${x.qty}` : ""}</td><td>{x.total ? money(x.total) : "Free"}</td></tr>)}
            {taxPercent > 0 && <tr><td>Taxes ({taxPercent}%)</td><td>{money(pr.tax)}</td></tr>}
            <tr className="total"><td>Total</td><td>{money(pr.total)}</td></tr>
          </tbody>
        </table>
      )}
      {problem && <div className="notice warn" role="alert">{problem}</div>}
      {!!p.security_deposit_cents && <p className="hint">Plus a refundable security deposit of {money(p.security_deposit_cents)}, collected by your host and returned after check-out. Not included in the total.</p>}
      {!bookable && <div className="notice info">This listing isn't published yet, so it can't be booked.</div>}
      {ready ? (
        <Link className="btn btn-primary btn-block" href={bookHref(p.slug, ci, co, party)}>{p.booking_mode === "instant" ? "Reserve" : "Request to book"}</Link>
      ) : (
        <button className="btn btn-primary btn-block" disabled>{p.booking_mode === "instant" ? "Reserve" : "Request to book"}</button>
      )}
      <p className="hint" style={{ textAlign: "center" }}>
        {!ci || !co ? "Select dates on the calendar to see the total price." : p.booking_mode === "instant" ? "Your booking is confirmed right away." : "The host replies within 24 hours."} {paymentNote}
      </p>
    </aside>
  );
}

export function MobileBookBar() {
  const { p, ci, co, party, bookable } = use();
  const { pr, problem } = useQuote();
  const ready = !!(pr && !problem && bookable);
  return (
    <div className="mobile-book">
      <div style={{ flex: 1, minWidth: 0 }}>
        {pr && !problem ? <><b className="mono">{money(pr.total)}</b> <span className="muted">· {pr.nights} nights</span></> : <><b className="mono">{money(priceTag(p).cents)}</b> <span className="muted">/ {priceTag(p).unit}</span></>}
      </div>
      {ready ? <Link className="btn btn-primary" href={bookHref(p.slug, ci, co, party)}>{p.booking_mode === "instant" ? "Reserve" : "Request"}</Link> : <a className="btn btn-primary" href="#availability">Check dates</a>}
    </div>
  );
}

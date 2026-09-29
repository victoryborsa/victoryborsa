"use client";
import Link from "next/link";
import { createContext, useContext, useMemo, useState } from "react";
import { Calendar, addDaysC } from "./Calendar.tsx";
import { quote } from "@/lib/pricing.ts";
import { money } from "@/lib/money.ts";

type P = { slug: string; nightly_price_cents: number; cleaning_fee_cents: number; min_nights: number; max_nights: number; max_guests: number; booking_mode: "instant" | "request" };
type Ctx = { p: P; today: string; taken: Set<string>; taxPercent: number; ci: string; co: string; guests: number; msg: string; pick: (d: string) => void; clear: () => void; setGuests: (n: number) => void; bookable: boolean };
const BookingCtx = createContext<Ctx | null>(null);
const use = () => useContext(BookingCtx)!;
const nights = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const fmt = (s: string) => (s ? new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "Add date");

export function BookingProvider({ p, today, unavailable, taxPercent, initial, bookable, children }: { p: P; today: string; unavailable: string[]; taxPercent: number; initial: { ci: string; co: string; guests: number }; bookable: boolean; children: React.ReactNode }) {
  const taken = useMemo(() => new Set(unavailable), [unavailable]);
  const rangeFree = (a: string, b: string) => { for (let d = a; d < b; d = addDaysC(d, 1)) if (taken.has(d)) return false; return true; };
  const validInitial = initial.ci && initial.co && initial.ci >= today && initial.co > initial.ci && rangeFree(initial.ci, initial.co);
  const [ci, setCi] = useState(validInitial ? initial.ci : "");
  const [co, setCo] = useState(validInitial ? initial.co : "");
  const [guests, setGuests] = useState(Math.min(Math.max(1, initial.guests || 2), p.max_guests));
  const [msg, setMsg] = useState(initial.ci && !validInitial ? "The dates from your search aren't available here. Pick new dates below." : "");

  const pick = (d: string) => {
    setMsg("");
    if (!ci || co || d <= ci) {
      if (taken.has(d)) return setMsg("That night is already booked. Pick another check-in date.");
      setCi(d); setCo("");
      return;
    }
    if (!rangeFree(ci, d)) return setMsg("Your stay can't include nights that are already booked. Pick an earlier check-out date or different dates.");
    const n = nights(ci, d);
    if (n < p.min_nights) return setMsg(`This home has a ${p.min_nights}-night minimum stay. Pick a check-out on or after ${fmt(addDaysC(ci, p.min_nights))}.`);
    if (n > p.max_nights) return setMsg(`Stays here can be up to ${p.max_nights} nights.`);
    setCo(d);
  };
  const value: Ctx = { p, today, taken, taxPercent, ci, co, guests, msg, pick, clear: () => { setCi(""); setCo(""); setMsg(""); }, setGuests, bookable };
  return <BookingCtx.Provider value={value}>{children}</BookingCtx.Provider>;
}

export function AvailabilitySection() {
  const { p, today, taken, ci, co, msg, pick, clear } = use();
  const choosingCheckout = !!ci && !co;
  const dayState = (d: string) => {
    const past = d < today;
    const isTaken = taken.has(d);
    let canCheckout = false;
    if (choosingCheckout && d > ci) { canCheckout = true; for (let x = ci; x < d; x = addDaysC(x, 1)) if (taken.has(x)) { canCheckout = false; break; } }
    const className = d === ci || d === co ? "sel" : ci && co && d > ci && d < co ? "in" : "";
    return { disabled: past || (isTaken && !canCheckout), className, note: isTaken ? "unavailable" : undefined };
  };
  return (
    <section id="availability">
      <div className="row"><h2>Availability</h2><span className="spacer" />{ci && <button type="button" className="linkbtn" onClick={clear}>Clear dates</button>}</div>
      <p className="muted" aria-live="polite">
        {!ci ? "Select your check-in date." : !co ? `Now select your check-out date. Minimum stay: ${p.min_nights} night${p.min_nights > 1 ? "s" : ""}.` : `${nights(ci, co)} nights: ${fmt(ci)} to ${fmt(co)}.`}
      </p>
      {msg && <div className="notice error" role="alert">{msg}</div>}
      <Calendar today={today} startMonth={ci || today} dayState={dayState} onPick={pick} />
      <div className="legend"><span><i style={{ background: "var(--accent)" }} />Your dates</span><span><i style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }} />Unavailable (crossed out)</span></div>
    </section>
  );
}

function useQuote() {
  const { p, ci, co, guests, taxPercent, taken } = use();
  if (!ci || !co) return { pr: null, problem: "" };
  let problem = "";
  const n = nights(ci, co);
  if (n < p.min_nights) problem = `This home has a ${p.min_nights}-night minimum stay.`;
  else if (guests > p.max_guests) problem = `This home fits up to ${p.max_guests} guests.`;
  else for (let d = ci; d < co; d = addDaysC(d, 1)) if (taken.has(d)) { problem = "Some of these nights are booked. Choose different dates."; break; }
  return { pr: quote(p, ci, co, taxPercent), problem };
}

function bookHref(slug: string, ci: string, co: string, guests: number) {
  return `/book/${slug}?` + new URLSearchParams({ ci, co, guests: String(guests) });
}

export function BookingPanel({ paymentNote }: { paymentNote: string }) {
  const { p, ci, co, guests, setGuests, bookable, taxPercent } = use();
  const { pr, problem } = useQuote();
  const ready = !!(ci && co && pr && !problem && bookable);
  return (
    <aside className="panel sticky" aria-label="Book this home" id="book">
      <div className="panel-price"><b>{money(p.nightly_price_cents)}</b><span className="muted">/ night</span></div>
      <a href="#availability" className="datepair" style={{ color: "inherit", textDecoration: "none" }}>
        <div><small>Check-in</small>{fmt(ci)}</div>
        <div><small>Check-out</small>{fmt(co)}</div>
      </a>
      <label className="field">
        <span>Guests</span>
        <select className="input" value={guests} onChange={e => setGuests(Number(e.target.value))}>
          {Array.from({ length: p.max_guests }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} guest{n > 1 ? "s" : ""}</option>)}
        </select>
        <span className="hint">Maximum {p.max_guests} guests</span>
      </label>
      {pr && !problem && (
        <table className="breakdown">
          <tbody>
            <tr><td>{money(pr.nightly)} × {pr.nights} nights</td><td>{money(pr.base)}</td></tr>
            {pr.cleaning > 0 && <tr><td>Cleaning fee</td><td>{money(pr.cleaning)}</td></tr>}
            {taxPercent > 0 && <tr><td>Taxes ({taxPercent}%)</td><td>{money(pr.tax)}</td></tr>}
            <tr className="total"><td>Total</td><td>{money(pr.total)}</td></tr>
          </tbody>
        </table>
      )}
      {problem && <div className="notice warn" role="alert">{problem}</div>}
      {!bookable && <div className="notice info">This listing isn't published yet, so it can't be booked.</div>}
      {ready ? (
        <Link className="btn btn-primary btn-block" href={bookHref(p.slug, ci, co, guests)}>{p.booking_mode === "instant" ? "Reserve" : "Request to book"}</Link>
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
  const { p, ci, co, guests, bookable } = use();
  const { pr, problem } = useQuote();
  const ready = !!(pr && !problem && bookable);
  return (
    <div className="mobile-book">
      <div style={{ flex: 1, minWidth: 0 }}>
        {pr && !problem ? <><b className="mono">{money(pr.total)}</b> <span className="muted">· {pr.nights} nights</span></> : <><b className="mono">{money(p.nightly_price_cents)}</b> <span className="muted">/ night</span></>}
      </div>
      {ready ? <Link className="btn btn-primary" href={bookHref(p.slug, ci, co, guests)}>{p.booking_mode === "instant" ? "Reserve" : "Request"}</Link> : <a className="btn btn-primary" href="#availability">Check dates</a>}
    </div>
  );
}

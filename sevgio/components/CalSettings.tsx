"use client";
import Link from "next/link";
import { useState } from "react";

export type CalSettingsData = {
  id: string; title: string; status: string;
  base: string; baseUnit: "night" | "month"; smart: { min: string; max: string } | null;
  weekly: number; monthly: number;
  fees: { label: string; value: string }[];
  minNights: number; maxNights: number; instant: boolean;
  month: { label: string; booked: number; nights: number };
  blocks: number; feeds: number;
};

const Chevron = () => <svg className="cs-chev" viewBox="0 0 24 24" aria-hidden><path d="M9 6l6 6-6 6" /></svg>;

/** The panel beside one listing's month: its prices and availability at a glance, each card opening the place to change it. */
export function CalSettings({ d }: { d: CalSettingsData }) {
  const [tab, setTab] = useState<"pricing" | "availability">("pricing");
  const edit = `/host/listings/${d.id}`;
  const pct = d.month.nights ? Math.round((d.month.booked / d.month.nights) * 100) : 0;
  return (
    <aside className="cs" aria-label={`Settings for ${d.title}`}>
      <div className="cs-head">
        <h2 className="cs-h">Settings</h2>
        {d.status !== "published" && <span className="pill warn">{d.status === "draft" ? "Draft" : "Hidden"}</span>}
      </div>
      <div className="cs-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "pricing"} onClick={() => setTab("pricing")}>Pricing</button>
        <button type="button" role="tab" aria-selected={tab === "availability"} onClick={() => setTab("availability")}>Availability</button>
      </div>
      {tab === "pricing" ? (
        <div className="cs-body" role="tabpanel" aria-label="Pricing">
          <p className="cs-sec">Rates</p>
          <Link className="cs-card" href={`${edit}#pricing`}>
            <span><span className="cs-k">Base rate</span><b className="cs-big">{d.base}<small> / {d.baseUnit}</small></b>
              {d.smart && <span className="cs-v">Smart pricing on: {d.smart.min} to {d.smart.max}</span>}</span><Chevron />
          </Link>
          <Link className="cs-card" href={`${edit}#guest-pricing`}>
            <span><span className="cs-k">Extended stay discounts</span><span className="cs-v">Weekly: {d.weekly}%</span><span className="cs-v">Monthly: {d.monthly}%</span></span><Chevron />
          </Link>
          <p className="cs-sec">Additional charges</p>
          <Link className="cs-card" href={`${edit}#pricing`}>
            <span><span className="cs-k">Fees</span>{d.fees.length ? d.fees.map(f => <span key={f.label} className="cs-v">{f.label}: {f.value}</span>) : <span className="cs-v">No extra fees</span>}</span><Chevron />
          </Link>
        </div>
      ) : (
        <div className="cs-body" role="tabpanel" aria-label="Availability">
          <p className="cs-sec">{d.month.label}</p>
          <div className="cs-card cs-static">
            <span style={{ width: "100%" }}><span className="cs-k">Nights booked</span><b className="cs-big">{d.month.booked}<small> of {d.month.nights}</small></b>
              <span className="cs-meter" aria-hidden><i style={{ width: `${pct}%` }} /></span><span className="cs-v">{pct}% full</span></span>
          </div>
          <p className="cs-sec">Rules</p>
          <Link className="cs-card" href={`${edit}#pricing`}>
            <span><span className="cs-k">Length of stay</span><span className="cs-v">{d.minNights} to {d.maxNights} nights</span><span className="cs-v">{d.instant ? "Instant booking" : "Request to book"}</span></span><Chevron />
          </Link>
          <Link className="cs-card" href={`${edit}/calendar`}>
            <span><span className="cs-k">Block dates</span><span className="cs-v">{d.blocks ? `${d.blocks} blocked period${d.blocks === 1 ? "" : "s"} coming up` : "Nothing blocked"}</span></span><Chevron />
          </Link>
          <Link className="cs-card" href={`${edit}/calendar`}>
            <span><span className="cs-k">Calendar sync</span><span className="cs-v">{d.feeds ? `${d.feeds} site${d.feeds === 1 ? "" : "s"} connected` : "Airbnb, Vrbo, Booking.com: not connected"}</span></span><Chevron />
          </Link>
        </div>
      )}
    </aside>
  );
}

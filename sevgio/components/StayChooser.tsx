import Link from "next/link";
import { isRangeFree } from "@/lib/bookings.ts";
import { isIsoDate } from "@/lib/dates.ts";
import { money } from "@/lib/money.ts";
import { priceTag } from "@/lib/pricing.ts";

type Opt = { id: string; slug: string; title: string; max_guests: number; nightly_price_cents: number; monthly_price_cents?: number | null; bedrooms: number; bathroom_type: string };

/** "Whole house or a room?" — shown on any listing that is part of a house with rooms. */
export async function StayChooser({ current, house, rooms, sp }: { current: Opt; house: Opt; rooms: Opt[]; sp: { ci?: string; co?: string; guests?: string } }) {
  if (!rooms.length) return null;
  const opts = [house, ...rooms];
  const dated = isIsoDate(sp.ci) && isIsoDate(sp.co) && sp.ci! < sp.co!;
  const free = dated ? await Promise.all(opts.map(o => isRangeFree(o.id, sp.ci!, sp.co!))) : [];
  const guests = Number(sp.guests) || 0;
  const qs = new URLSearchParams(Object.entries({ ci: sp.ci, co: sp.co, guests: sp.guests }).filter((e): e is [string, string] => !!e[1])).toString();
  const short = (t: string) => (/ [-\u2013\u2014] /.test(t) ? t.split(/ [-\u2013\u2014] /).slice(1).join(" - ") : t);
  return (
    <section className="chooser" aria-label="Whole house or a room">
      <h2>How would you like to stay?</h2>
      <p className="muted">Book the whole house for your group, or just a private room.{dated ? " Showing availability for your dates." : " Pick dates to see what's free."}</p>
      <div className="chooser-grid">
        {opts.map((o, i) => {
          const on = o.id === current.id;
          const tooSmall = guests > o.max_guests;
          const status = dated ? (free[i] ? "Available" : "Booked") : null;
          return (
            <Link key={o.id} href={`/stays/${o.slug}${qs ? "?" + qs : ""}`} className={`chooser-opt${on ? " on" : ""}${status === "Booked" || tooSmall ? " dim" : ""}`} aria-current={on ? "page" : undefined}>
              <span className="chooser-kind">{i === 0 ? "Whole house" : "Private room"}</span>
              <b>{i === 0 ? o.title : short(o.title)}</b>
              <span className="hint">Up to {o.max_guests} guests · {o.bedrooms} bedroom{o.bedrooms === 1 ? "" : "s"}{i > 0 ? ` · ${o.bathroom_type === "shared" ? "shared" : "private"} bath` : ""}</span>
              <span className="chooser-foot">
                <span>From <b>{money(priceTag(o).cents)}</b> / {priceTag(o).unit}</span>
                {status && <span className={`pill ${status === "Available" ? "ok" : "neutral"}`}>{status}</span>}
                {tooSmall && <span className="pill neutral">Too small for {guests}</span>}
                {on && <span className="pill ok">Selected</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

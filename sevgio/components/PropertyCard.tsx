import Link from "next/link";
import type { CardProperty } from "@/lib/queries.ts";
import { photoUrl } from "@/lib/queries.ts";
import { money } from "@/lib/money.ts";
import { priceTag, quote } from "@/lib/pricing.ts";
import type { Demand } from "@/lib/smart-pricing.ts";
import { Rating } from "./ui.tsx";

export function PropertyCard({ p, ci, co, guests, taxPercent, eager, demand }: { p: CardProperty; ci?: string; co?: string; guests?: number; taxPercent: number; eager?: boolean; demand?: Demand }) {
  const pr = ci && co ? quote({ ...p, demand }, ci, co, taxPercent, guests ? { adults: guests, children: 0, free_children: 0 } : undefined) : null;
  const qs = new URLSearchParams();
  if (ci && co) { qs.set("ci", ci); qs.set("co", co); }
  if (guests) qs.set("guests", String(guests));
  const href = `/stays/${p.slug}${qs.size ? "?" + qs : ""}`;
  const badge = p.booking_mode === "request" ? "Request to book" : p.rating && p.rating >= 4.9 && p.review_count >= 10 ? "Guest favorite" : "";
  return (
    <Link className="card" href={href}>
      <div className="ph">
        {p.cover_id ? (
          <img src={photoUrl(p.cover_id, "thumb")} alt={p.title} loading={eager ? "eager" : "lazy"} decoding="async" width={720} height={540} />
        ) : (
          <div className="noph">Photos coming soon</div>
        )}
        {badge && <span className="badge">{badge}</span>}
      </div>
      <div className="card-body">
        <div className="card-top">
          <span className="muted" style={{ fontSize: 14 }}>{p.city}{p.area ? `, ${p.area}` : ""}</span>
          <Rating rating={p.rating} count={p.review_count} />
        </div>
        <span className="card-title">{p.title}</span>
        <span className="specs">
          <span>{p.max_guests} guests</span>
          <span>{p.bedrooms} bedroom{p.bedrooms === 1 ? "" : "s"}</span>
          <span>{p.bathrooms} {p.bathroom_type === "shared" ? "shared" : "private"} bath{p.bathrooms === 1 ? "" : "s"}</span>
        </span>
        <span className="price">
          {pr ? (
            <><b>{money(pr.total)}</b> total for {pr.nights} night{pr.nights === 1 ? "" : "s"} <span className="muted">· {money(priceTag(p).cents)}/{priceTag(p).unit}</span></>
          ) : (
            <>From <b>{money(priceTag(p).cents)}</b> <span className="muted">/ {priceTag(p).unit}{p.monthly_price_cents ? " · all-inclusive" : ""}</span></>
          )}
        </span>
      </div>
    </Link>
  );
}

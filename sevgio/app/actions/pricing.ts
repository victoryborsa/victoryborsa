"use server";
import { revalidatePath } from "next/cache";
import { q } from "@/lib/db.ts";
import { requireManageable } from "@/lib/access.ts";
import { str, type ActionState } from "@/lib/validate.ts";
import { money, toCents } from "@/lib/money.ts";
import { addDays, fmtDate, isIsoDate, nightsBetween, todayLocal } from "@/lib/dates.ts";
import { logEvent } from "@/lib/log.ts";

const refresh = (id: string, slug: string) => {
  revalidatePath(`/host/listings/${id}/calendar`);
  revalidatePath("/host/calendar");
  revalidatePath("/admin/calendar");
  revalidatePath(`/stays/${slug}`);
};

/** Turns Smart Pricing on or off for one listing, with its lowest and highest nightly price (firm limits for every automatic change). */
export async function smartPricingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { u, p } = await requireManageable(str(fd, "id", 40));
  const on = str(fd, "smart") === "on";
  const min = str(fd, "min_price") ? toCents(str(fd, "min_price")) : p.min_price_cents;
  const max = str(fd, "max_price") ? toCents(str(fd, "max_price")) : p.max_price_cents;
  if (p.monthly_price_cents && on) return { error: "Smart Pricing works with nightly prices. This home is rented by the month." };
  if ((min !== null && !(min > 0)) || (max !== null && !(max > 0))) return { error: "Enter the lowest and highest prices as numbers, like 90 and 149." };
  if (on && !(min && max)) return { error: "Smart Pricing needs your lowest and highest price per night." };
  if (min && max && min > max) return { error: "The lowest price per night can't be higher than the highest." };
  await q("UPDATE properties SET smart_pricing = $2, min_price_cents = $3, max_price_cents = $4, updated_at = now() WHERE id = $1", [p.id, on, min, max]);
  await logEvent("info", "Pricing", `Smart Pricing ${on ? "on" : "off"} for ${p.title}${min && max ? ` (${money(min)} to ${money(max)})` : ""}`, {}, u.id);
  refresh(p.id, p.slug);
  return { ok: on ? `Smart Pricing is on. Prices now follow demand and stay between ${money(min!)} and ${money(max!)}.` : "Smart Pricing is off. Every night uses your normal price unless you set one yourself." };
}

/** Sets your own price for some nights, or (mode=clear) puts them back on the normal price or Smart Pricing. Booked stays keep the price they were booked at. */
export async function nightPriceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { u, p } = await requireManageable(str(fd, "id", 40));
  const start = str(fd, "start", 10), end = str(fd, "end", 10) || (isIsoDate(start) ? addDays(start, 1) : "");
  const clear = str(fd, "mode") === "clear";
  const today = todayLocal();
  if (!isIsoDate(start) || !isIsoDate(end) || end <= start) return { error: "Pick the first night, then the day after the last night." };
  if (start < today) return { error: "Choose dates from today onwards." };
  if (nightsBetween(start, end) > 366) return { error: "Set prices for up to a year at a time." };
  if (p.monthly_price_cents) return { error: "This home is rented by the month, so it has no nightly prices to change." };
  const last = addDays(end, -1);
  const range = last === start ? fmtDate(start, { month: "short", day: "numeric", year: "numeric" })
    : `${fmtDate(start, { month: "short", day: "numeric" })} to ${fmtDate(last, { month: "short", day: "numeric", year: "numeric" })}`;
  if (clear) {
    await q("DELETE FROM night_prices WHERE property_id = $1 AND night >= $2 AND night < $3", [p.id, start, end]);
    refresh(p.id, p.slug);
    return { ok: `${range}: back to ${p.smart_pricing ? "Smart Pricing" : `your normal price (${money(p.nightly_price_cents)})`}.` };
  }
  const price = toCents(str(fd, "price", 12));
  if (!price || price < 100 || price > 10_000_00) return { error: "Enter the nightly price in dollars, like 125." };
  if (p.smart_pricing && p.min_price_cents && p.max_price_cents && (price < p.min_price_cents || price > p.max_price_cents))
    return { error: `Your Smart Pricing limits are ${money(p.min_price_cents)} to ${money(p.max_price_cents)} a night. Pick a price in that range, or change the limits first.` };
  await q(
    `INSERT INTO night_prices (property_id, night, price_cents)
     SELECT $1, d::date, $4 FROM generate_series($2::date, $3::date - 1, interval '1 day') d
     ON CONFLICT (property_id, night) DO UPDATE SET price_cents = EXCLUDED.price_cents, updated_at = now()`,
    [p.id, start, end, price],
  );
  await logEvent("info", "Pricing", `Set ${money(price)} a night for ${range} on ${p.title}`, {}, u.id);
  refresh(p.id, p.slug);
  return { ok: `${range}: ${money(price)} a night. Guests see it on the calendar and at checkout.` };
}

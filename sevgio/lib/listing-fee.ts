import "server-only";
import { q } from "./db.ts";
import { addDays, fmtDate, todayLocal } from "./dates.ts";
import { getSettings } from "./settings.ts";
import { sendEmail, siteUrl } from "./email.ts";
import { logEvent } from "./log.ts";
import { money } from "./money.ts";

export { feeState, type FeeRow, type FeeState } from "./listing-fee-state.ts";

/** How a host pays the yearly fee: Zelle / Venmo from Admin → Settings, or by contacting us. */
export async function feePayText() {
  const s = await getSettings();
  const ways = [s.zelle_to && `Zelle to ${s.zelle_to}`, s.venmo_handle && `Venmo to ${s.venmo_handle}`].filter(Boolean).join(" or ");
  return { amount: money(s.listing_fee_cents), how: ways ? `Pay ${money(s.listing_fee_cents)} by ${ways}, with the listing name in the note.` : `Contact us to pay ${money(s.listing_fee_cents)}.`, enabled: s.listing_fee_enabled };
}

/** Daily: remind hosts 14 days before their year ends; hide listings whose paid year has run out. Listings never paid are left alone. */
export async function runListingFeeJobs() {
  const s = await getSettings();
  if (!s.listing_fee_enabled) return { reminded: 0, hidden: 0 };
  const today = todayLocal();
  const { how } = await feePayText();
  const soon = await q<{ id: string; title: string; email: string; name: string; until: string }>(
    `UPDATE properties p SET listing_fee_reminded_at = now() FROM users h
     WHERE h.id = p.host_id AND h.role = 'host' AND NOT p.listing_fee_waived AND p.listing_paid_until BETWEEN $1 AND $2
       AND p.listing_fee_reminded_at IS NULL
     RETURNING p.id, p.title, h.email, h.name, p.listing_paid_until::text AS until`, [today, addDays(today, 14)]);
  for (const r of soon) await sendEmail(r.email, `Renew your listing: ${r.title}`, `Hi ${r.name.split(" ")[0]},\n\nThe yearly listing fee for ${r.title} is paid until ${fmtDate(r.until)}. To keep it live, renew before then.\n\n${how}\n\nYour listings: ${siteUrl()}/host/listings`);
  const expired = await q<{ id: string; title: string; email: string; name: string }>(
    `UPDATE properties p SET status = 'hidden', updated_at = now() FROM users h
     WHERE h.id = p.host_id AND h.role = 'host' AND NOT p.listing_fee_waived AND p.status = 'published' AND p.listing_paid_until < $1
     RETURNING p.id, p.title, h.email, h.name`, [today]);
  for (const r of expired) {
    await sendEmail(r.email, `Listing paused: ${r.title}`, `Hi ${r.name.split(" ")[0]},\n\nThe yearly listing fee for ${r.title} has run out, so the listing is hidden from guests for now. Existing bookings are not affected.\n\n${how}\n\nWe'll switch it back on as soon as it's paid.`);
    await logEvent("warn", "Listing fees", `${r.title} hidden: yearly listing fee not renewed`, { property: r.id });
  }
  return { reminded: soon.length, hidden: expired.length };
}

import "server-only";
import { q } from "./db.ts";
import type { CardProperty } from "./queries.ts";
import { todayLocal } from "./dates.ts";

export type CorpHome = CardProperty & { parent_title: string | null; corp_furnished: boolean; corp_lease_only: boolean; corp_app_fee_cents: number; corp_apply_url: string; corp_price_note: string; utilities: string; corp_monthly_cents: number; corp_deposit_cents: number; corp_cleaning_cents: number; corp_pet_fee_cents: number; corp_available_from: string | null; furnished_finder_url: string };

/** Published homes the host chose to show on the Corporate Housing page: furnished before unfurnished; within each, numbered ones first, then the lowest monthly rate. */
export async function corporateHomes(): Promise<CorpHome[]> {
  return q<CorpHome>(`SELECT p.*, to_char(p.corp_available_from, 'YYYY-MM-DD') AS corp_available_from,
      (SELECT id FROM photos ph WHERE ph.property_id = p.id ORDER BY position, created_at LIMIT 1) AS cover_id,
      (SELECT u.name FROM users u WHERE u.id = p.host_id) AS host_name,
      (SELECT h.title FROM properties h WHERE h.id = p.parent_id) AS parent_title
    FROM properties p WHERE p.status = 'published' AND p.corp_listed AND p.corp_monthly_cents IS NOT NULL
    ORDER BY p.corp_furnished DESC, p.corp_position NULLS LAST, p.corp_monthly_cents, p.parent_id IS NOT NULL, p.title`);
}

/** "Available now" or "Available Nov 1", from the date the home is free for a new monthly guest. */
export function availableLabel(from: string | null, today = todayLocal()): string {
  if (!from || from <= today) return "Available now";
  const d = new Date(from + "T12:00:00");
  return "Available from " + d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(from.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) });
}

/** Only real Furnished Finder links are shown. */
export const isFurnishedFinderUrl = (u: string) => /^https:\/\/(www\.)?furnishedfinder\.com\//i.test(u);

/** The line under the monthly price: the host's own note, or the default for furnished and unfurnished homes. */
export const priceNote = (p: { corp_price_note?: string; corp_furnished?: boolean; utilities?: string }) =>
  p.corp_price_note || (p.corp_furnished === false ? "Unfurnished, long-term lease" : p.utilities ? "Fixed monthly price" : "Fixed price, all inclusive");

/** Application links: a full web address, or a file on this site such as /docs/application.pdf. */
export const isWebUrl = (u: string) => /^https:\/\/[^\s]+$/i.test(u) || /^\/docs\/[\w.-]+$/.test(u);

/** A PDF application is offered as a download; anything else opens as a link. */
export const isPdf = (u: string) => /\.pdf$/i.test(u);

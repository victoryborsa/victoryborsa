import { q } from "./db.ts";
import { SECTIONS, type Section } from "./guide.ts";

/** The editable fields of a guide place (also what a saved draft holds). */
export type PlaceFields = {
  section: Section["id"]; name: string; area: string; description: string; icon: string;
  address: string; map_query: string; website: string; phone: string;
  sponsored: boolean; sponsor_start: string | null; sponsor_end: string | null;
};
export type GuidePlace = PlaceFields & {
  id: string; position: number; status: "draft" | "published" | "hidden"; draft: Partial<PlaceFields> | null;
  photos: string[]; updated_at: string;
};

export const SECTION_IDS = SECTIONS.map(s => s.id);
export const SECTION_TONE: Record<string, string> = Object.fromEntries(SECTIONS.map(s => [s.id, s.tone]));
export const SECTION_TITLE: Record<Section["id"], string> = { see: "Must-see & historic", museums: "Museums & gardens", eat: "What to eat", drink: "Bars, breweries & nightlife", do: "Things to do" };
/** How many places a category shows before "See more". */
export const FIRST_SHOWN = 4;

const COLS = `p.id, p.section, p.position, p.status, p.name, p.area, p.description, p.icon, p.address, p.map_query, p.website, p.phone,
  p.sponsored, p.sponsor_start::text, p.sponsor_end::text, p.draft, p.updated_at::text,
  coalesce((SELECT array_agg(ph.id::text ORDER BY ph.position, ph.created_at) FROM site_photos ph WHERE ph.slot = 'place:' || p.id), '{}') AS photos`;

/** Every place, for the admin page (drafts and hidden ones too), in category order. */
export async function allGuidePlaces(): Promise<GuidePlace[]> {
  return q<GuidePlace>(`SELECT ${COLS} FROM guide_places p ORDER BY array_position($1::text[], p.section), p.position, p.created_at`, [SECTION_IDS]);
}

/** A sponsorship counts only between its start and end dates (either may be left open). */
export function sponsorActive(p: Pick<PlaceFields, "sponsored" | "sponsor_start" | "sponsor_end">, today: string): boolean {
  return p.sponsored && (!p.sponsor_start || p.sponsor_start <= today) && (!p.sponsor_end || today <= p.sponsor_end);
}

/** A place as it would look once its saved draft is published. */
export function withDraft(p: GuidePlace): GuidePlace {
  return p.draft ? { ...p, ...p.draft } : p;
}

/**
 * The places the public guide shows, grouped by category in the admin's order.
 * Visitors see published places only. Preview (admins) also shows drafts and hidden places, with unpublished edits applied.
 */
export async function guideSections(preview: boolean): Promise<Record<Section["id"], (GuidePlace & { previewNote?: string })[]>> {
  const rows = await q<GuidePlace>(`SELECT ${COLS} FROM guide_places p ${preview ? "" : "WHERE p.status = 'published'"} ORDER BY p.position, p.created_at`);
  const out = Object.fromEntries(SECTION_IDS.map(id => [id, [] as (GuidePlace & { previewNote?: string })[]])) as Record<Section["id"], (GuidePlace & { previewNote?: string })[]>;
  for (const r of rows) {
    const p = preview ? withDraft(r) : r;
    const note = !preview ? undefined : r.status === "draft" ? "Draft: not published yet" : r.status === "hidden" ? "Hidden from visitors" : r.draft ? "Unpublished changes" : undefined;
    (out[p.section] ??= []).push({ ...p, previewNote: note });
  }
  return out;
}

/** Google Maps directions to a place: its address if it has one, otherwise its name. */
export function placeMapLink(p: { name: string; address?: string; map_query?: string }) {
  const where = p.address?.trim() || `${p.map_query?.trim() || p.name}, Pittsburgh, PA`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where)}`;
}

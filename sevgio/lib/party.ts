import type { Party } from "./pricing.ts";

const n = (v: unknown, fallback: number) => {
  const x = parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) && x >= 0 ? Math.min(x, 50) : fallback;
};

/** Reads adults/children/infants from a URL. Old links with only `guests` count everyone as adults. */
export function partyFromParams(sp: Record<string, string | string[] | undefined>): Party {
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const guests = n(get("guests"), 2);
  return { adults: Math.max(1, n(get("adults"), guests)), children: n(get("children"), 0), free_children: n(get("infants"), 0) };
}

export function partyFromForm(fd: FormData): Party {
  return { adults: n(fd.get("adults"), 0), children: n(fd.get("children"), 0), free_children: n(fd.get("infants"), 0) };
}

export function partyLabel(p: { adults: number; children: number; free_children: number }): string {
  const parts = [`${p.adults} adult${p.adults === 1 ? "" : "s"}`];
  if (p.children) parts.push(`${p.children} child${p.children === 1 ? "" : "ren"}`);
  if (p.free_children) parts.push(`${p.free_children} young child${p.free_children === 1 ? "" : "ren"} (free)`);
  return parts.join(", ");
}

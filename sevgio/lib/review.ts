import { q } from "./db.ts";

/** Stays in an open double booking ("b:<booking id>" or "c:<other-site stay id>"): their status reads Needs Review until it's settled. */
export async function reviewKeys(): Promise<Set<string>> {
  const rows = await q<{ pair_key: string }>("SELECT pair_key FROM booking_conflicts WHERE status = 'open' AND kind = 'overlap' AND cleared_at IS NULL");
  return new Set(rows.flatMap(r => r.pair_key.split("|")));
}

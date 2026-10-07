/** Where an error is in being dealt with. Resolved only follows Verified, so nothing is closed without checking the fix. */
export const STAGE_ORDER = ["new", "investigating", "fix_deployed", "verified", "resolved"] as const;
export type Stage = typeof STAGE_ORDER[number];
export const STAGE_LABEL: Record<Stage, string> = { new: "New", investigating: "Investigating", fix_deployed: "Fix Deployed", verified: "Verified", resolved: "Resolved" };
/** The stages an error can move to from here: the next one, or back to Investigating. */
export function nextStages(cur: string): Stage[] {
  const i = STAGE_ORDER.indexOf(cur as Stage);
  const out: Stage[] = [];
  if (i >= 0 && i < STAGE_ORDER.length - 1) out.push(STAGE_ORDER[i + 1]);
  if (cur !== "investigating" && cur !== "new") out.push("investigating");
  return out;
}

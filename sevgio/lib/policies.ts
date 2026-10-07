// One master source for a listing's rules. Every page and email reads these, never the free text, so the same home can't say
// "Pets allowed" in one place and "No pets" in another. Free-text house rules and descriptions that repeat or contradict a
// field are left out for guests and listed for the host on the listing check.
import { AMENITY_GROUPS, CANCELLATION } from "./constants.ts";
import { PET_FEE_PER } from "./pricing.ts";
import { money } from "./money.ts";

export type PolicyInput = {
  amenities: string[]; pet_fee_cents: number; pet_fee_per: string; corp_lease_only?: boolean; corp_pet_fee_cents?: number;
  smoking?: string | null; has_exterior_cameras: boolean; camera_locations: string; max_guests: number; check_in_time: string; check_out_time: string;
  min_nights: number; cleaning_fee_cents: number; security_deposit_cents: number; corp_deposit_cents?: number; cancellation_policy: string;
  house_rules: string[]; description: string;
};

export const SMOKING: Record<string, string> = { no: "No smoking anywhere on the property", outside: "Smoking allowed outside only", yes: "Smoking allowed" };

const PARKING_KEYS = Object.keys(AMENITY_GROUPS.find(g => g.name === "Parking & access")?.items || {}).filter(k => k !== "ev" && k !== "private_entrance");
const PARKING_LABEL = (AMENITY_GROUPS.find(g => g.name === "Parking & access")?.items || {}) as Record<string, string>;

/** "No interior cameras" said once, whatever the host typed. */
const cleanCameraText = (s: string) => s.replace(/\s*(there are\s+)?no (security\s+)?cameras? (inside|indoors|in the (home|house|unit|apartment))[^.]*\.?/gi, "").replace(/\s{2,}/g, " ").trim().replace(/[.,;\s]+$/, "");

export type Policies = {
  petsAllowed: boolean; pets: string; smoking: string; cameras: string; doorbellCamera: boolean; parking: string; maxGuests: string;
  checkIn: string; checkOut: string; minStay: string; cleaningFee: string; deposit: string; cancellation: string;
};

export function policies(p: PolicyInput): Policies {
  const petsAllowed = p.amenities.includes("pets");
  const petFee = p.corp_lease_only ? (p.corp_pet_fee_cents ? `${money(p.corp_pet_fee_cents)} pet fee` : "") : p.pet_fee_cents ? `${money(p.pet_fee_cents)} ${PET_FEE_PER[p.pet_fee_per] || ""}`.trim() : "";
  const where = cleanCameraText(p.camera_locations || "");
  const doorbell = /doorbell|ring\b/i.test(where);
  const parking = PARKING_KEYS.filter(k => p.amenities.includes(k)).map(k => PARKING_LABEL[k]);
  const deposit = p.corp_lease_only ? p.corp_deposit_cents || p.security_deposit_cents : p.security_deposit_cents;
  return {
    petsAllowed,
    pets: !petsAllowed ? "Not allowed" : petFee ? `Allowed · ${petFee}` : "Allowed · no pet fee",
    smoking: SMOKING[p.smoking || "no"] || SMOKING.no,
    cameras: p.has_exterior_cameras ? `Exterior cameras${where ? `: ${where}` : ""}.${doorbell ? " Includes a doorbell camera." : ""} No interior cameras.` : "No security cameras on the property. No interior cameras.",
    doorbellCamera: doorbell,
    parking: parking.length ? parking.join(", ") : "No parking on the property",
    maxGuests: `${p.max_guests} guest${p.max_guests === 1 ? "" : "s"}`,
    checkIn: `After ${p.check_in_time}`,
    checkOut: `Before ${p.check_out_time}`,
    minStay: `${p.min_nights} night${p.min_nights === 1 ? "" : "s"}`,
    cleaningFee: p.cleaning_fee_cents ? money(p.cleaning_fee_cents) : "None",
    deposit: deposit ? `${money(deposit)}, refundable after check-out` : "None",
    cancellation: CANCELLATION[p.cancellation_policy]?.label || p.cancellation_policy,
  };
}

// What a sentence or rule line says about a topic: "yes", "no", or null when it doesn't say.
const PETS_NO = /\b(no pets?|pets? (are )?not (allowed|permitted)|pet[- ]free|no (dogs|cats|animals))\b/i;
const PETS_YES = /\b(pets? (are )?(allowed|welcome|ok|friendly)|(dogs?|cats?)( and (dogs?|cats?))? (are )?(welcome|allowed)|pet[- ]friendly)\b/i;
const SMOKE_NO = /\b(no smoking|non[- ]smoking|smoke[- ]free|smoking (is )?not (allowed|permitted))\b/i;
const SMOKE_YES = /\b(smoking (is )?(allowed|permitted|ok)|smokers? welcome)\b/i;
const CAMERA = /\bcameras?\b/i;
const PET_WORD = /\b(pets?|dogs?|cats?|animals?)\b/i;
// Any other mention of pets (pet rent, "cats $8 a month") only makes sense when pets are allowed.
const pets = (s: string) => (PETS_NO.test(s) ? "no" : PETS_YES.test(s) || PET_WORD.test(s) ? "yes" : null);
const smoke = (s: string) => (SMOKE_NO.test(s) ? "no" : SMOKE_YES.test(s) ? "yes" : null);
// Lines that only repeat a field shown in House rules: check-in/out times, guest limits.
const REPEATS = /^(check[- ]?in|check[- ]?out|max(imum)? (guests|occupants)|minimum stay)\b/i;

export type Finding = { field: string; text: string; problem: string };

/** House rules for guests: lines that repeat or contradict a master field are left out (the field is shown instead). */
export function guestRules(p: PolicyInput): string[] {
  return p.house_rules.filter(r => !ruleFinding(p, r));
}

function ruleFinding(p: PolicyInput, line: string): Finding | null {
  const pet = pets(line), sm = smoke(line);
  const smokingNo = (p.smoking || "no") !== "yes";
  // A line that agrees with the setting but adds prices (pet rent) is kept.
  if (pet && (pet === "yes") === p.amenities.includes("pets")) return line.includes("$") ? null : { field: "Pets", text: line, problem: "Repeats the Pets setting" };
  if (pet) return { field: "Pets", text: line, problem: `Says pets are ${pet === "yes" ? "allowed" : "not allowed"}, but the Pets setting says ${p.amenities.includes("pets") ? "allowed" : "not allowed"}` };
  if (sm && sm !== "no" && smokingNo) return { field: "Smoking", text: line, problem: "Says smoking is allowed, but the Smoking setting doesn't allow it" };
  if (sm === "no" && !smokingNo) return { field: "Smoking", text: line, problem: "Says no smoking, but the Smoking setting allows it" };
  if (sm) return { field: "Smoking", text: line, problem: "Repeats the Smoking setting" };
  if (CAMERA.test(line)) return { field: "Security cameras", text: line, problem: "Cameras are described by the camera setting" };
  if (REPEATS.test(line.trim())) return { field: "House rules", text: line, problem: "Repeats a setting shown in House rules" };
  return null;
}

/** The description for guests, without sentences that contradict a master field. */
export function guestDescription(p: PolicyInput): string {
  return p.description.split(/\n/).map(par => sentences(par).filter(s => !descFinding(p, s)).join(" ")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
const sentences = (par: string) => par.match(/[^.!?]+[.!?]*\s*/g)?.map(s => s.trim()).filter(Boolean) ?? [];

function descFinding(p: PolicyInput, s: string): Finding | null {
  const pet = pets(s), sm = smoke(s);
  if (pet && (pet === "yes") !== p.amenities.includes("pets")) return { field: "Pets", text: s, problem: `The description says pets are ${pet === "yes" ? "welcome" : "not allowed"}, but the Pets setting says ${p.amenities.includes("pets") ? "allowed" : "not allowed"}` };
  if (sm === "yes" && (p.smoking || "no") !== "yes") return { field: "Smoking", text: s, problem: "The description allows smoking, but the Smoking setting doesn't" };
  if (CAMERA.test(s) && /\bno\b/i.test(s) && p.has_exterior_cameras && !/inside|interior|indoors/i.test(s)) return { field: "Security cameras", text: s, problem: "The description says there are no cameras, but the camera setting lists exterior cameras" };
  if (CAMERA.test(s) && !/\bno\b/i.test(s) && !p.has_exterior_cameras) return { field: "Security cameras", text: s, problem: "The description mentions cameras, but the camera setting says there are none" };
  return null;
}

/** Everything on a listing that repeats or contradicts its master fields, for the host's listing check. */
export function listingFindings(p: PolicyInput): Finding[] {
  const out: Finding[] = [];
  for (const r of p.house_rules) { const f = ruleFinding(p, r); if (f) out.push(f); }
  for (const par of p.description.split(/\n/)) for (const s of sentences(par)) { const f = descFinding(p, s); if (f) out.push(f); }
  const loc = p.camera_locations || "";
  if ((loc.match(/no (security )?cameras? (inside|indoors)/gi) || []).length > 0) out.push({ field: "Security cameras", text: loc, problem: "“No cameras inside” is added automatically; it doesn't need to be typed in the camera locations" });
  return out;
}

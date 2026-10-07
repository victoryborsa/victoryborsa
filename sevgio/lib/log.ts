import { q } from "./db.ts";

// Never keep passwords, card details, secrets, sign-in codes or door codes in the log.
const SECRET_KEY = /pass(word)?|secret|token|api[_-]?key|authorization|cookie|card|cvc|cvv|iban|door|lock|access[_-]?code|code_hash|otp/i;
const SECRET_TEXT: [RegExp, string][] = [
  [/\b\d(?:[ -]?\d){12,18}\b/g, "[card number hidden]"],
  [/\b(sk|pk|rk|whsec)_(live|test)_[A-Za-z0-9]+/g, "[key hidden]"],
  [/(password|pass|secret|token|door code|lock code|access code)(\s*[:=]\s*)\S+/gi, "$1$2[hidden]"],
  [/([?&](token|key|secret|code)=)[^&\s]+/gi, "$1[hidden]"],
];
export function scrubText(s: string): string {
  return SECRET_TEXT.reduce((t, [re, to]) => t.replace(re, to), s);
}
export function scrub(v: unknown, depth = 0): unknown {
  if (typeof v === "string") return scrubText(v);
  if (!v || typeof v !== "object" || depth > 4) return v;
  if (Array.isArray(v)) return v.map(x => scrub(x, depth + 1));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_KEY.test(k) ? "[hidden]" : scrub(x, depth + 1)]));
}

/** The deployed version (Render sets RENDER_GIT_COMMIT), so each error shows which release it happened on. */
export const deployVersion = () => (process.env.RENDER_GIT_COMMIT || process.env.APP_VERSION || "").slice(0, 7) || "local";

/** Writes to the admin Operations log ("Errors & activity"). Never throws, so logging can't break a request.
 *  Useful details keys: route, stack, booking (id or reference), property, platform. Secrets are removed before saving. */
export async function logEvent(level: "info" | "warn" | "error", area: string, message: string, details: Record<string, unknown> = {}, userId: string | null = null) {
  const clean = scrub({ ...details, version: details.version ?? deployVersion() }) as Record<string, unknown>;
  const text = scrubText(message).slice(0, 1000);
  try {
    await q("INSERT INTO event_log (level, area, message, details, user_id) VALUES ($1, $2, $3, $4, $5)", [level, area, text, JSON.stringify(clean), userId]);
  } catch (e) {
    console.error("[event_log failed]", area, text, e);
  }
  if (level === "error") console.error(`[${area}] ${text}`, clean);
}

import { q } from "./db.ts";

/** Writes to the admin "Errors & activity" log. Never throws, so logging can't break a request. */
export async function logEvent(level: "info" | "warn" | "error", area: string, message: string, details: Record<string, unknown> = {}, userId: string | null = null) {
  try {
    await q("INSERT INTO event_log (level, area, message, details, user_id) VALUES ($1, $2, $3, $4, $5)", [level, area, message.slice(0, 1000), JSON.stringify(details), userId]);
  } catch (e) {
    console.error("[event_log failed]", area, message, e);
  }
  if (level === "error") console.error(`[${area}] ${message}`, details);
}

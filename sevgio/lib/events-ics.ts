// Pure helpers for events (no server code), shared by the sync, the pages and the tests.
import { addDays } from "./dates.ts";

export const CATEGORIES = ["Sports", "Music", "Arts & Theatre", "Family", "Festivals", "Food & Drink", "Other"];
export const TEAMS = [
  { key: "steelers", name: "Steelers", match: /steelers/i },
  { key: "pirates", name: "Pirates", match: /pirates/i },
  { key: "penguins", name: "Penguins", match: /penguins/i },
] as const;
export const teamOf = (title: string) => TEAMS.find(t => t.match.test(title))?.key ?? null;

/** "19:00" → "7 PM", "19:30" → "7:30 PM" */
export function timeLabel(t: string) {
  if (!/^\d{2}:\d{2}/.test(t)) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

// ---------- iCal reading (with times, places and links) ----------

const NY = "America/New_York";
function nyParts(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: NY, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** DTSTART value → Pittsburgh-local date and "HH:MM" ('' when all-day). */
function icsWhen(params: string, value: string): { date: string; time: string } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (!h || /VALUE=DATE(?!-)/.test(params)) return { date: `${y}-${mo}-${d}`, time: "" };
  if (z) return nyParts(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)));
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` }; // floating or TZID time: treat as local Pittsburgh time
}

export function parseEventIcs(text: string) {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: { uid: string; title: string; date: string; end: string | null; time: string; venue: string; url: string }[] = [];
  let cur: Record<string, { params: string; value: string }> | null = null;
  const unesc = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT" && cur) {
      const start = cur.DTSTART && icsWhen(cur.DTSTART.params, cur.DTSTART.value);
      if (start && cur.SUMMARY) {
        let end: string | null = null;
        if (cur.DTEND) {
          const e = icsWhen(cur.DTEND.params, cur.DTEND.value);
          // All-day DTEND is exclusive, so a one-day event ends the next day.
          if (e) end = start.time === "" ? addDays(e.date, -1) : e.date;
        }
        out.push({ uid: (cur.UID?.value || `${start.date}-${cur.SUMMARY.value}`).slice(0, 200), title: unesc(cur.SUMMARY.value), date: start.date, end: end && end > start.date ? end : null,
          time: start.time, venue: unesc(cur.LOCATION?.value || "").split(",")[0], url: /^https:\/\//.test(cur.URL?.value || "") ? cur.URL!.value.trim() : "" });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const [name, ...params] = line.slice(0, i).split(";");
    cur[name.toUpperCase()] = { params: params.join(";"), value: line.slice(i + 1) };
  }
  return out;
}

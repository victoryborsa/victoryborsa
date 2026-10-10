import { addDays, isIsoDate } from "./dates.ts";

const icsDate = (d: string) => d.replace(/-/g, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Calendar feed for Airbnb/Vrbo/Google Calendar: one all-day event per booking or block. */
export function buildIcs(name: string, events: { uid: string; start: string; end: string; summary: string }[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sevgio//Bookings//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`];
  for (const e of events) {
    out.push("BEGIN:VEVENT", `UID:${e.uid}@sevgio`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDate(e.start)}`, `DTEND;VALUE=DATE:${icsDate(e.end)}`, `SUMMARY:${esc(e.summary)}`, "END:VEVENT");
  }
  out.push("END:VCALENDAR");
  return out.join("\r\n") + "\r\n";
}

export type IcsEvent = { start: string; end: string; summary: string; uid: string; description: string; cancelled: boolean };

const unescape = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

/** Reads all-day or timed events from an iCal file and returns them as night ranges [start, end). */
export function parseIcs(text: string): IcsEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const events: IcsEvent[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0];
    const get = (key: string) => {
      const m = body.match(new RegExp(`^${key}(?:;[^:\\r\\n]*)?:(.*)$`, "m"));
      return m ? m[1].trim() : "";
    };
    const toDate = (v: string) => {
      const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
      return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
    };
    const start = toDate(get("DTSTART"));
    let end = toDate(get("DTEND"));
    if (!isIsoDate(start)) continue;
    if (!isIsoDate(end) || end <= start) end = addDays(start, 1);
    events.push({
      start, end,
      summary: unescape(get("SUMMARY")).replace(/\n/g, " ").slice(0, 120) || "Blocked",
      uid: get("UID").slice(0, 300),
      description: unescape(get("DESCRIPTION")).slice(0, 2000),
      cancelled: /^cancel/i.test(get("STATUS")),
    });
  }
  return events;
}

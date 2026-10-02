/** Reads "3:00 pm", "3 PM", "15:00" or "noon" into an hour 0–23. Falls back to 3 pm. */
export function parseHour(t: string): number {
  const s = t.trim().toLowerCase();
  if (s.startsWith("noon")) return 12;
  const m = s.match(/^(\d{1,2})(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (!m) return 15;
  let h = Number(m[1]);
  const ap = m[2]?.[0];
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  return h >= 0 && h <= 23 ? h : 15;
}

const label = (h: number) => {
  const hh = h % 24, ap = hh < 12 ? "am" : "pm", n = hh % 12 === 0 ? 12 : hh % 12;
  return `${n}:00 ${ap}`;
};

/** Hourly arrival windows from check-in time until midnight. */
export function arrivalOptions(checkInTime: string): string[] {
  const start = parseHour(checkInTime);
  const out: string[] = [];
  for (let h = start; h < 24; h++) out.push(`${label(h)} - ${label(h + 1)}`);
  out.push("After midnight");
  return out;
}

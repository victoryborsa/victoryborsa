/**
 * Names the outside site that read a Sevgio calendar link, from its User-Agent. Browsers (someone opening the link
 * to look at it) are kept apart as "Web browser". Anything else that isn't recognised is kept as "Other calendar" so it still shows up.
 */
export const KNOWN_SITES = ["Airbnb", "Booking.com", "Vrbo", "Furnished Finder"] as const;

export function siteFromAgent(agent: string): string | null {
  const a = agent.toLowerCase();
  if (a.includes("airbnb")) return "Airbnb";
  if (a.includes("booking.com") || a.includes("bookingcom")) return "Booking.com";
  if (a.includes("vrbo") || a.includes("homeaway") || a.includes("expedia")) return "Vrbo";
  if (a.includes("furnished")) return "Furnished Finder";
  if (a.includes("google")) return "Google Calendar";
  // Someone opening the link in a web browser (or a site that reads it pretending to be one).
  if (/mozilla|chrome|safari|firefox|edg\//.test(a) && !/bot|calendar|ical|caldav/.test(a)) return "Web browser";
  return agent.trim() ? "Other calendar" : null;
}

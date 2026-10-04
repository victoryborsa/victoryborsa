import { money } from "@/lib/money.ts";
import type { Quote } from "@/lib/pricing.ts";

const day = (s: string) => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Each night's rate, exactly as the availability calendar shows it. Only when nights cost different amounts. */
export function NightlyRates({ q }: { q: Quote }) {
  if (new Set(q.byNight.map(x => x.cents)).size < 2) return null;
  const grouped = q.extraGuests > 0 || q.fewerGuests > 0;
  return (
    <details className="nightly-rates">
      <summary>See each night's rate</summary>
      <ul>
        {q.byNight.map(x => <li key={x.date}><span>{day(x.date)}</span><span className="mono">{money(x.cents)}</span></li>)}
      </ul>
      {grouped && <p className="hint">Rates before the {q.extraGuests > 0 ? "extra-guest fee" : "smaller-group discount"}, which is included in the total.</p>}
    </details>
  );
}

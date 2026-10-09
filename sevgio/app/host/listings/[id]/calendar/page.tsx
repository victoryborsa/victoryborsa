import { requireManageable } from "@/lib/access.ts";
import { q } from "@/lib/db.ts";
import { RELATED } from "@/lib/bookings.ts";
import { addDays, eachNight, fmtDate, todayLocal, fmtWhen } from "@/lib/dates.ts";
import { siteUrl } from "@/lib/email.ts";
import { HostCalendar } from "@/components/HostCalendar.tsx";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { CopyField } from "@/components/CopyField.tsx";
import { KNOWN_SITES } from "@/lib/ical-fetches.ts";
import { SmartPricingCard } from "@/components/SmartPricingCard.tsx";
import { demandBetween, manualPrices } from "@/lib/demand.ts";
import { money } from "@/lib/money.ts";
import { nightPriceAction, smartPricingAction } from "@/app/actions/pricing.ts";
import { addBlockAction, addFeedAction, removeBlockAction, removeFeedAction, syncFeedAction } from "@/app/actions/host.ts";

export default async function CalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { p } = await requireManageable(id);
  const today = todayLocal(), until = addDays(today, 560);
  const [bookings, linkedBlocks, blocks, feeds, fetches] = await Promise.all([
    q<{ check_in: string; check_out: string }>(`SELECT check_in, check_out FROM bookings WHERE property_id IN ${RELATED("$1")} AND status IN ('pending','awaiting_payment','confirmed') AND check_out > $2`, [p.id, today]),
    q<{ start_date: string; end_date: string }>(`SELECT start_date, end_date FROM blocks WHERE property_id IN ${RELATED("$1")} AND property_id <> $1 AND end_date > $2`, [p.id, today]),
    q<{ id: string; start_date: string; end_date: string; note: string; source: string }>("SELECT id, start_date, end_date, note, source FROM blocks WHERE property_id = $1 AND end_date > $2 ORDER BY start_date", [p.id, today]),
    q<{ id: string; name: string; url: string; last_synced_at: string | null; last_error: string | null }>("SELECT id, name, url, last_synced_at, last_error FROM ical_feeds WHERE property_id = $1 ORDER BY created_at", [p.id]),
    q<{ site: string; last_at: string }>("SELECT site, last_at FROM ical_fetches WHERE property_id = $1 ORDER BY last_at DESC", [p.id]),
  ]);
  const notSeen = KNOWN_SITES.filter(s => !fetches.some(f => f.site === s));
  // Nights taken by the linked whole home or room count as booked here too.
  const booked = [...bookings.map(b => [b.check_in, b.check_out]), ...linkedBlocks.map(b => [b.start_date, b.end_date])].flatMap(([a, z]) => eachNight(a, z < until ? z : until));
  const blocked = blocks.flatMap(b => eachNight(b.start_date, b.end_date < until ? b.end_date : until));
  const hostBlocks = blocks.filter(b => b.source === "host");
  const exportUrl = `${siteUrl()}/api/ical/${p.ical_token}.ics`;
  // Each night's rate on the calendar: Smart Pricing (with why) and the nights you priced yourself.
  const [demand, prices] = await Promise.all([p.smart_pricing ? demandBetween(today, until) : Promise.resolve(undefined), manualPrices([p.id], today, until)]);
  const pricing = { nightly_price_cents: p.nightly_price_cents, smart_pricing: p.smart_pricing, min_price_cents: p.min_price_cents, max_price_cents: p.max_price_cents, demand, prices: prices[p.id] };
  const dollars = (c: number | null) => (c ? String(c / 100) : "");

  return (
    <div className="stack" style={{ gap: 20 }}>
      <SmartPricingCard action={smartPricingAction} d={{ id: p.id, on: p.smart_pricing, min: dollars(p.min_price_cents), max: dollars(p.max_price_cents), base: money(p.nightly_price_cents), monthly: !!p.monthly_price_cents }} />
      <HostCalendar propertyId={p.id} today={today} booked={booked} blocked={blocked} pricing={pricing} monthly={!!p.monthly_price_cents} action={addBlockAction} priceAction={nightPriceAction} />

      <div className="box">
        <h3>Your blocked dates</h3>
        {hostBlocks.length === 0 ? <p className="muted">No dates blocked.</p> : (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {hostBlocks.map(b => (
              <li key={b.id} className="row">
                <span style={{ flex: 1 }}>{fmtDate(b.start_date)} → {fmtDate(b.end_date)} <span className="muted">· {b.note}</span></span>
                <form action={removeBlockAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="block" value={b.id} /><button className="btn btn-ghost btn-sm">Open these dates</button></form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="box">
        <h3>Sync with Airbnb, Vrbo and Booking.com</h3>
        <p className="muted">Two-way calendar sync prevents double bookings when this home is listed on other sites too.</p>
        <div className="stack">
          <strong>1. Send Sevgio bookings to other sites</strong>
          <p className="hint">Paste this link into the other site's "import calendar" setting. It stays private: anyone with the link can see which dates are booked, but not who booked them.</p>
          <CopyField value={exportUrl} label="Sevgio calendar link" />
          <div className="stack" style={{ gap: 4 }} data-testid="ical-fetches">
            <span className="hint"><b>Who is reading this link.</b> Each site checks it on its own schedule, often every few hours, so new bookings and blocked dates reach them after their next check, not instantly.</span>
            {fetches.map(f => <span key={f.site} className="hint">{f.site === "Web browser" ? "Opened in a web browser" : `${f.site} last checked it`}: <b>{fmtWhen(f.last_at)}</b></span>)}
            {notSeen.length > 0 && <span className="hint">Not seen yet: {notSeen.join(", ")}. If you added the link there, it shows here after that site's first check.</span>}
          </div>
        </div>
        <div className="stack">
          <strong>2. Block dates booked on other sites</strong>
          <p className="hint">Paste the other site's "export calendar" link. Sevgio checks it every hour, and you can refresh it any time.</p>
          {feeds.map(f => (
            <div key={f.id} className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <b>{f.name}</b>
                <div className="hint" style={{ wordBreak: "break-all" }}>{f.url.slice(0, 80)}{f.url.length > 80 ? "…" : ""}</div>
                <div className="hint">{f.last_synced_at ? `Last updated ${fmtWhen(f.last_synced_at)}` : "Not imported yet"}</div>
                {f.last_error && <div className="err-text">{f.last_error}</div>}
              </div>
              <form action={syncFeedAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="feed" value={f.id} /><button className="btn btn-ghost btn-sm">Refresh now</button></form>
              <form action={removeFeedAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="feed" value={f.id} /><button className="btn btn-danger btn-sm">Remove</button></form>
            </div>
          ))}
          <ActionForm action={addFeedAction} className="stack" resetOnOk>
            <input type="hidden" name="id" value={p.id} />
            <div className="grid-2">
              <label className="field"><span>Site</span><select className="input" name="name"><option>Airbnb</option><option>Booking.com</option><option>Vrbo</option><option>Furnished Finder</option><option>Other calendar</option></select></label>
              <label className="field"><span>Calendar link (.ics)</span><input className="input" name="url" type="url" placeholder="https://www.airbnb.com/calendar/ical/…" /></label>
            </div>
            <div><SubmitButton className="btn btn-ghost" pendingText="Importing…">Add and import</SubmitButton></div>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}

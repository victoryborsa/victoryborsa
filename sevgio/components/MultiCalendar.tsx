import Link from "next/link";
import type { User } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { addDays, fmtDate, fmtShort, isIsoDate, nightsBetween, todayLocal } from "@/lib/dates.ts";
import { demandBetween, manualPrices } from "@/lib/demand.ts";
import { DateRangePicker } from "./DatePicker.tsx";
import { nightPrice, priceWhy, type Demand } from "@/lib/smart-pricing.ts";
import { smartPricingAction } from "@/app/actions/pricing.ts";
import { AutoSubmit } from "./AutoSubmit.tsx";
import { CalDetails, type StayDetail } from "./CalDetails.tsx";
import { extrasOf, partyLabel } from "@/lib/party.ts";
import { CalSettings, type CalSettingsData } from "./CalSettings.tsx";
import { reservationStatus } from "@/lib/statuses.ts";
import { assignLanes, barLines, groupByArrival, inView, propertyColor } from "@/lib/cal-layout.ts";
import { channelLabel } from "@/lib/channels.ts";
import { DatePicker } from "./DatePicker.tsx";
import { ReservationList } from "./ReservationList.tsx";
import { loadReservations } from "@/lib/reservation-list.ts";
import { editRule, SCOPES, type Scope, type Sort } from "@/lib/reservation-rules.ts";

type Prop = { id: string; title: string; city: string; parent_id: string | null; status: string; cover_id: string | null; nightly_price_cents: number; smart_pricing: boolean; min_price_cents: number | null; max_price_cents: number | null };
type Res = { id: string; code: string; property_id: string; check_in: string; check_out: string; status: string; guest_name: string; guests: number; nights: number;
  adults: number; children: number; free_children: number; pets: number; guest_phone: string; arrival_time: string; total_cents: number; services: unknown;
  payment_status: string; paid_cents: number };
/** Dates you blocked (source "host"), or a stay from another site (source "ical:…", from channel_stays, with its site and money status). */
type Blk = { id: string; property_id: string; start_date: string; end_date: string; note: string; source: string; feed_name: string | null;
  channel: string | null; kind: string | null; ref: string; guest: string; status: string; needs: boolean; payout: number | null };

/** The booking site of a stay from another site, for its color and label. */
function siteOf(b: Blk): { key: string; label: string } | null {
  if (!b.channel) return null;
  return { key: b.channel, label: b.channel === "other" ? b.feed_name || "Other site" : channelLabel(b.channel) };
}

const COLS = `id, title, city, parent_id, status, nightly_price_cents, smart_pricing, min_price_cents, max_price_cents,
  (SELECT ph.id FROM photos ph WHERE ph.property_id = p.id ORDER BY ph.position, ph.created_at LIMIT 1) AS cover_id`;
const MAX_RANGE = 92;
const VIEWS = [["list", "Reservations"], ["day", "Day"], ["week", "Week"], ["month", "Month"], ["arrivals", "Arrivals"]] as const;
type View = "list" | "day" | "week" | "month" | "arrivals" | "range";
const STATUSES = [["", "All active"], ["confirmed", "Confirmed"], ["pending", "Awaiting approval"], ["awaiting_payment", "Awaiting payment"],
  ["other", "Booked on other sites"], ["blocked", "Blocked by you"], ["cancelled", "Cancelled"]] as const;
const dayLabel = (d: string) => new Date(d + "T12:00:00Z");
const monthStart = (d: string) => d.slice(0, 8) + "01";
const nextMonth = (d: string) => addDays(monthStart(d), 32).slice(0, 8) + "01";
const prevMonth = (d: string) => addDays(monthStart(d), -1).slice(0, 8) + "01";
/** The same day one month later (or earlier), e.g. Oct 15 → Nov 15; Jan 31 → Feb 28. */
function addMonths(d: string, n: number) {
  const [y, m, day] = d.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10);
}

/**
 * Reservations calendar: a Reservations list (Today / Upcoming / History cards, the default), Day, Week and Month boards,
 * and an Arrivals list grouped by check-in day. "Today" is always Pittsburgh's date (America/New_York).
 */
export async function MultiCalendar({ u, basePath, sp }: { u: User; basePath: string; sp: CalParams }) {
  const today = todayLocal();
  // "Go to month" sends ?month=YYYY-MM; every view then opens on the 1st of that month.
  const anchor = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month || "") ? sp.month + "-01" : isIsoDate(sp.start) ? sp.start! : null;
  // "Go to date" with a last day (?start=…&end=…) shows exactly those days, e.g. Oct 7 to Oct 15.
  const pickedDays = anchor && isIsoDate(sp.end) && sp.end! >= anchor ? Math.min(nightsBetween(anchor, sp.end!) + 1, MAX_RANGE) : 0;
  // Older links used ?days=14/30/60; they still work as a plain date range.
  const rangeDays = pickedDays || (Number.isInteger(Number(sp.days)) && Number(sp.days) >= 1 && Number(sp.days) <= MAX_RANGE ? Number(sp.days) : 0);
  const view: View = pickedDays ? "range"
    : sp.view === "day" || sp.view === "week" || sp.view === "month" || sp.view === "arrivals" || sp.view === "list" ? sp.view
    : rangeDays ? "range" : "list";
  // The Reservations list: which stays (Today, Upcoming or History), seen from which day (today, or one picked), in which order.
  const scope: Scope = SCOPES.some(([v]) => v === sp.scope) ? sp.scope as Scope : "upcoming";
  const sort: Sort = sp.sort === "booked" ? "booked" : "arrival";
  const day = isIsoDate(sp.date) ? sp.date! : today;
  const status = STATUSES.some(([v]) => v === sp.status) ? sp.status! : "";
  let start: string, days: number, prev: string, next: string, todayStart: string;
  if (view === "list") {
    start = day; days = 1; prev = addDays(start, -1); next = addDays(start, 1); todayStart = today;
  } else if (view === "day") {
    start = anchor || today; days = 1; prev = addDays(start, -1); next = addDays(start, 1); todayStart = today;
  } else if (view === "week") {
    start = anchor || today; days = 7; prev = addDays(start, -7); next = addDays(start, 7); todayStart = today;
  } else if (view === "month" || view === "arrivals") {
    // Month is a wall calendar: the whole calendar month, Sunday to Saturday. Arrivals lists the same month.
    start = monthStart(anchor || today); days = nightsBetween(start, nextMonth(start)); prev = prevMonth(start); next = nextMonth(start); todayStart = monthStart(today);
  } else {
    days = rangeDays; start = anchor || today; prev = addDays(start, -days); next = addDays(start, days); todayStart = today;
  }
  const end = addDays(start, days);
  const demand = await demandBetween(start, end);
  // Red circle on a date: a game, a big event or a holiday in Pittsburgh.
  const evTitle = (d: string) => (demand[d]?.notable ? demand[d].reasons.join(" · ") : undefined);

  const all = await (u.role === "admin"
    ? q<Prop>(`SELECT ${COLS} FROM properties p`)
    : q<Prop>(`SELECT ${COLS} FROM properties p WHERE host_id = $1`, [u.id]));
  // Whole homes sorted by name, each followed by its rooms.
  const homes = all.filter(p => !p.parent_id || !all.some(h => h.id === p.parent_id)).sort((a, b) => a.title.localeCompare(b.title));
  const ordered = homes.flatMap(h => [h, ...all.filter(r => r.parent_id === h.id).sort((a, b) => a.title.localeCompare(b.title))]);
  // Every listing keeps one color (by its place in the full list), whatever the filters.
  const colorOf = new Map(ordered.map((p, i) => [p.id, propertyColor(i)]));
  const byId = new Map(ordered.map(p => [p.id, p]));
  const placeName = (p: Prop) => { const h = p.parent_id ? byId.get(p.parent_id) : null; return h ? `${h.title} › ${p.title}` : p.title; };
  const picked = ordered.find(p => p.id === sp.property);
  // A room can be narrowed to inside the chosen house.
  const roomsOfPicked = picked ? ordered.filter(p => p.parent_id === picked.id) : [];
  const room = roomsOfPicked.find(p => p.id === sp.room);
  const selected = room || picked;
  // Choosing a whole home also shows its rooms (their calendars are linked).
  const rows = selected ? ordered.filter(p => p.id === selected.id || p.parent_id === selected.id) : ordered;
  // A room's calendar also shows its house's stays (booking the house blocks the room).
  const ids = [...rows.map(r => r.id), ...(selected?.parent_id ? [selected.parent_id] : [])];

  const [allRes, allBlocks] = ids.length
    ? await Promise.all([
        q<Res>(`SELECT id, code, property_id, check_in, check_out, status, guest_name, guests, nights, adults, children, free_children, pets, guest_phone, arrival_time, total_cents, services, payment_status, paid_cents FROM bookings
                WHERE property_id = ANY($1) AND status = ANY($4) AND check_in < $3 AND check_out >= $2`,
          [ids, start, end, status === "cancelled" ? ["cancelled"] : ["pending", "awaiting_payment", "confirmed"]]),
        // Stays from other sites come from their reservation records (so past stays and Finance match the calendar);
        // copies of a booking that's already shown (a site echoing Sevgio's calendar back, or the linked home/room) are left out.
        q<Blk>(`SELECT k.id, k.property_id, k.start_date, k.end_date, k.note, k.source, NULL AS feed_name, NULL AS channel, NULL AS kind, '' AS ref, '' AS guest,
                       'confirmed' AS status, false AS needs, NULL::int AS payout
                FROM blocks k WHERE k.source = 'host' AND k.property_id = ANY($1) AND k.start_date < $3 AND k.end_date >= $2
                UNION ALL
                SELECT c.id, c.property_id, c.check_in, c.check_out, c.summary, 'ical:' || coalesce(c.feed_id::text, c.source), f.name, c.channel, c.eff_kind, c.external_ref, c.guest_name,
                       c.status, c.eff_kind = 'reservation' AND (c.rent_cents IS NULL OR c.expected_payout_cents IS NULL), c.expected_payout_cents
                FROM channel_stays c LEFT JOIN ical_feeds f ON f.id = c.feed_id
                WHERE c.property_id = ANY($1) AND c.check_in < $3 AND c.check_out >= $2 AND c.eff_kind <> 'mirror' AND c.status = $4`,
          [ids, start, end, status === "cancelled" ? "cancelled" : "confirmed"]),
      ])
    : [[], []];
  // The status filter: one booking status, bookings from other sites, or dates you blocked.
  const res = allRes.filter(b => !status || status === b.status);
  const blocks = allBlocks.filter(b => status === "cancelled" ? b.status === "cancelled"
    : !status || (status === "other" && b.source.startsWith("ical")) || (status === "blocked" && !b.source.startsWith("ical")));
  const stays = toStays(res, blocks, byId, placeName, colorOf);
  const cards = view === "list" ? await loadReservations({ ids, places: ordered, scope, day, staffBase: u.role === "admin" ? "/admin/bookings/" : "/trips/",
    back: `${basePath}?` + new URLSearchParams({ view: "list", scope, ...(sort === "booked" ? { sort } : {}), ...(day !== today ? { date: day } : {}), ...(picked ? { property: picked.id } : {}), ...(room ? { room: room.id } : {}) }) }) : [];

  const keep = { ...(picked ? { property: picked.id } : {}), ...(room ? { room: room.id } : {}) };
  const link = (s: string, v: View = view) => v === "list" ? listLink({})
    : `${basePath}?` + new URLSearchParams({ view: v, start: s, ...(v === "range" ? { days: String(days) } : {}), ...keep, ...(status ? { status } : {}) });
  // Today's reservations: arriving, staying or leaving today, on every property unless one is picked in the filter.
  const listLink = (o: { scope?: Scope; sort?: Sort; date?: string }) => `${basePath}?` + new URLSearchParams({ view: "list", scope: o.scope || scope,
    ...((o.sort || sort) === "booked" ? { sort: "booked" } : {}), ...(o.date ? { date: o.date } : {}), ...keep });
  const todayHref = listLink({ scope: "today" });
  const period = view === "day" ? fmtDate(start, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : (view === "month" || view === "arrivals") && start.endsWith("-01") && end === nextMonth(start) ? fmtDate(start, { month: "long", year: "numeric" })
    : `${fmtShort(start)} - ${fmtDate(addDays(end, -1), { month: "short", day: "numeric", year: "numeric" })}`;
  const unit = view === "day" ? "day" : view === "week" ? "week" : view === "month" || view === "arrivals" ? "month" : "";
  const arrivalsToday = res.filter(r => r.check_in === today).length, guestsToday = res.filter(r => r.check_in === today).reduce((n, r) => n + r.guests, 0), departuresToday = res.filter(r => r.check_out === today).length;
  const inHouse = res.filter(r => r.check_in <= today && r.check_out > today && r.status === "confirmed").length;
  // On phones the boards become a list of stays in view, grouped by arrival day. Dates you blocked are left out.
  const listed = stays.filter(s => s.kind !== "blk" || status === "blocked");
  const phoneList = <ArrivalList className="mc-phone-list" stays={listed.filter(s => s.from < end && s.to > start)} today={today} colorOf={colorOf} before={start}
    empty={`Nothing booked ${view === "week" ? "this week" : `in ${period}`}.`} />;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="cal-top">
        <Link className={`btn btn-sm cal-today ${view === "list" && scope === "today" && day === today ? "btn-primary" : "btn-ghost"}`} href={todayHref}
          aria-current={view === "list" && scope === "today" && day === today ? "page" : undefined}>Today&apos;s reservations</Link>
        {view === "list" ? (
          <h2 className="mc-period">{scope === "today" ? (day === today ? "Today" : "Reservations on") : scope === "history" ? "History before" : "Upcoming from"} · {fmtDate(day, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</h2>
        ) : (
          <div className="cal-step">
            <Link className="cal-arrow" href={link(prev)} aria-label={unit ? `Previous ${unit}` : "Earlier"}>‹</Link>
            <h2 className="mc-period">{view === "arrivals" ? `Arrivals · ${period}` : period}</h2>
            <Link className="cal-arrow" href={link(next)} aria-label={unit ? `Next ${unit}` : "Later"}>›</Link>
            {unit && !(start <= today && today < end) && <Link className="btn btn-ghost btn-sm" href={link(todayStart)}>This {unit === "day" ? "day" : unit}</Link>}
          </div>
        )}
        <nav className="cal-tabs" aria-label="Calendar view">
          {VIEWS.map(([v, label]) => (
            <Link key={v} aria-current={view === v ? "page" : undefined} href={link(v === "day" || v === "week" ? (start <= today && today < end ? today : start) : start, v)}>{label}</Link>
          ))}
        </nav>
      </div>
      <div className="cal-filterbar">
      <form className="cal-prop cal-filters" method="get" action={basePath}>
        <AutoSubmit />
        <input type="hidden" name="view" value={view} />
        {view === "list" ? <>
          <input type="hidden" name="scope" value={scope} />
          {sort === "booked" && <input type="hidden" name="sort" value="booked" />}
          {day !== today && <input type="hidden" name="date" value={day} />}
        </> : <input type="hidden" name="start" value={start} />}
        {view === "range" && <input type="hidden" name="days" value={String(days)} />}
        {selected && <span className="cal-prop-ph" aria-hidden><Thumb p={selected} /></span>}
        <label className="cal-field">
          <span className="cal-field-l">Property</span>
          <select id="cal-property" className="input" name="property" defaultValue={picked?.id || ""}>
            <option value="">All properties</option>
            {ordered.map(p => <option key={p.id} value={p.id}>{p.parent_id ? "   ↳ " : ""}{p.title}</option>)}
          </select>
        </label>
        {roomsOfPicked.length > 0 && (
          <label className="cal-field">
            <span className="cal-field-l">Room</span>
            <select className="input" name="room" defaultValue={room?.id || ""}>
              <option value="">All rooms</option>
              {roomsOfPicked.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
        )}
        {view !== "list" && <label className="cal-field">
          <span className="cal-field-l">Status</span>
          <select className="input" name="status" defaultValue={status}>
            {STATUSES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>}
        <noscript><button className="btn btn-ghost">Show</button></noscript>
      </form>
      {view === "list" ? (
        <form className="cal-month" method="get" action={basePath}>
          <AutoSubmit />
          <input type="hidden" name="view" value="list" />
          <input type="hidden" name="scope" value={scope} />
          {sort === "booked" && <input type="hidden" name="sort" value="booked" />}
          {picked && <input type="hidden" name="property" value={picked.id} />}
          {room && <input type="hidden" name="room" value={room.id} />}
          <div className="cal-field cal-goto">
            <DatePicker key={day} name="date" label="Date" initial={day} today={today} clearable={false} maxMonths={24} />
          </div>
          <noscript><button className="btn btn-ghost btn-sm">Go</button></noscript>
        </form>
      ) : (
      <form className="cal-month" method="get" action={basePath}>
        <AutoSubmit />
        <input type="hidden" name="view" value={view === "range" ? "week" : view} />
        {/* Opens on today when today is on screen; pick one day to jump there, or a first and last day to see just that stretch. */}
        {picked && <input type="hidden" name="property" value={picked.id} />}
        {room && <input type="hidden" name="room" value={room.id} />}
        {status && <input type="hidden" name="status" value={status} />}
        <div className="cal-field cal-goto">
          <DateRangePicker key={start + days} id="cal-goto" names={["start", "end"]} labels={["Go to date", "Until"]} today={today} minNights={0} maxNights={MAX_RANGE - 1} maxMonths={24} endOptional
            initial={view === "range" ? { ci: start, co: addDays(end, -1) } : { ci: start <= today && today < end ? today : start }} />
        </div>
        <noscript><button className="btn btn-ghost btn-sm">Go</button></noscript>
      </form>
      )}
      </div>
      {view === "list" && (
        <div className="rv-bar">
          <nav className="seg-tabs" aria-label="Which reservations">
            {SCOPES.map(([v, label]) => <Link key={v} href={listLink({ scope: v, date: day !== today ? day : undefined })} aria-current={scope === v ? "page" : undefined}>{label}</Link>)}
          </nav>
          <nav className="seg-tabs" aria-label="Sort by">
            <Link href={listLink({ sort: "arrival", date: day !== today ? day : undefined })} aria-current={sort === "arrival" ? "page" : undefined}>Arrival Date</Link>
            <Link href={listLink({ sort: "booked", date: day !== today ? day : undefined })} aria-current={sort === "booked" ? "page" : undefined}>Reservation Date</Link>
          </nav>
        </div>
      )}
      {view !== "arrivals" && Object.values(demand).some(x => x.notable) && <p className="hint mc-legend"><span className="ev-dot" aria-hidden /> Red circle: a game, big event or holiday in Pittsburgh. Hover or tap the date to see it.{selected?.smart_pricing ? " Smart Pricing is on: prices in gold are raised for demand, in green lowered. Dotted prices are ones you set." : ""}</p>}

      {rows.length === 0 ? <div className="empty"><p className="muted">No listings yet.</p></div> : view === "list" ? (
        <ReservationList cards={cards} scope={scope} sort={sort} day={day} today={today} colorOf={colorOf}
          empty={scope === "today" ? `No one is arriving, staying or leaving on ${fmtDate(day, { weekday: "long", month: "long", day: "numeric" })}${selected ? ` at ${selected.title}` : ""}.`
            : scope === "history" ? "No past or cancelled reservations before this date." : "No current or upcoming reservations."} />
      ) : view === "arrivals" ? (
        <ArrivalList stays={listed.filter(s => s.from >= start && s.from < end)} today={today} colorOf={colorOf} empty={`No arrivals in ${period}.`} />
      ) : selected && view === "month" ? (
        <div className="cal-split">
          <MonthGrid p={selected} res={res} blocks={blocks} start={start} end={end} today={today} demand={demand} prices={(await manualPrices([selected.id], start, end))[selected.id]} />
          <CalSettings d={await settingsFor(selected, allRes, allBlocks, start, end, today)} smartAction={smartPricingAction} />
        </div>
      ) : view === "month" ? (
        <>
          <AllMonthGrid rows={rows} stays={stays} start={start} end={end} today={today} demand={demand} colorOf={colorOf} dayHref={d => link(d, "day")} />
          <MiniMonths rows={rows} stays={stays} start={start} end={end} today={today} colorOf={colorOf} basePath={basePath} />
          <h3 className="mc-list-h">Reservations in {period}</h3>
          <ArrivalList stays={listed.filter(s => s.from < end && s.to > start)} today={today} colorOf={colorOf} before={start} empty={`Nothing booked in ${period}.`} />
        </>
      ) : view === "day" ? (
        <Timeline rows={rows} stays={stays} start={start} days={1} today={today} mode="day" basePath={basePath} colorOf={colorOf} evTitle={evTitle} />
      ) : (
        <>
          <Timeline rows={rows} stays={stays} start={start} days={days} today={today} mode={view === "week" ? "week" : "range"} basePath={basePath} colorOf={colorOf} evTitle={evTitle} />
          {phoneList}
        </>
      )}
      <div className="row" style={{ gap: 20 }}>
        <span><b>{arrivalsToday}</b> <span className="muted">arriving today{guestsToday ? ` (${guestsToday} guest${guestsToday === 1 ? "" : "s"})` : ""}</span></span>
        <span><b>{departuresToday}</b> <span className="muted">leaving today</span></span>
        <span><b>{inHouse}</b> <span className="muted">stays in progress</span></span>
        <span className="spacer" />
        <span className="legend" style={{ margin: 0 }}>
          <span><i className="mc-key ok" />Sevgio</span>
          <span><i className="mc-key ch-airbnb" />Airbnb</span>
          <span><i className="mc-key ch-bookingcom" />Booking.com</span>
          <span><i className="mc-key ch-vrbo" />Vrbo</span>
          <span><i className="mc-key ch-furnished" />Furnished Finder</span>
          <span><i className="mc-key warn" />Awaiting approval / payment</span>
          <span><i className="mc-key cx" />Cancelled</span>
          <span><i className="mc-key blk" />Blocked by you</span>
        </span>
      </div>
      <CalDetails details={Object.fromEntries([...stays.map(s => [s.key, s.detail] as const), ...cards.map(c => [c.key, { ...c.detail, color: colorOf.get(c.pid) }] as const)])} />
      <p className="hint">{view === "list" ? <>Tap a reservation to see its property, room and booking details; the message icon opens that guest&apos;s conversation. Only unpaid Sevgio.com bookings can be edited. Paid bookings, reservations synced from Airbnb, Booking.com, Vrbo and other sites, and external calendar blocks are read-only. Dates use Pittsburgh time.</>
        : view === "day" ? "Each bar runs from check-in to check-out: a guest leaving this morning fills the left half, one arriving this afternoon the right half. Tap a reservation to see its details."
        : view === "arrivals" ? "Guests are grouped by the day they check in. Tap a reservation to see its details."
        : <>Each bar starts halfway through the check-in day and ends halfway through the check-out day, so a guest leaving and the next arriving share that day. Click a reservation to see its details. The colored edge beside each name is that listing&apos;s color. Rooms are listed under their house; booking the house blocks its rooms.</>}</p>
    </div>
  );
}

export type CalParams = { start?: string; end?: string; month?: string; days?: string; property?: string; room?: string; status?: string; view?: string; scope?: string; sort?: string; date?: string };

/** A reservation or blocked dates, ready to draw. `from`/`to` are check-in and check-out days. */
type Stay = {
  key: string; pid: string; from: string; to: string; kind: "res" | "ext" | "blk"; cls: string; label: string; status: string; tone: string;
  place: string; href?: string; title: string; guests?: number; code?: string; detail: StayDetail;
};

function toStays(res: Res[], blocks: Blk[], byId: Map<string, Prop>, placeName: (p: Prop) => string, colorOf: Map<string, string>): Stay[] {
  const place = (id: string) => { const p = byId.get(id); return p ? placeName(p) : ""; };
  return [
    ...res.map(b => {
      const st = reservationStatus({ status: b.status, check_in: b.check_in, check_out: b.check_out, today: todayLocal() });
      return { key: "b:" + b.id, pid: b.property_id, from: b.check_in, to: b.check_out, kind: "res" as const,
        cls: b.status === "confirmed" ? "ok" : b.status === "cancelled" ? "cx" : "warn", label: b.guest_name, status: st.label, tone: st.tone,
        place: place(b.property_id), href: `/trips/${b.code}`, guests: b.guests, code: b.code,
        detail: { title: b.guest_name, badge: st.label, badgeCls: st.tone, color: colorOf.get(b.property_id), href: `/trips/${b.code}`, msgHref: `/trips/${b.code}/messages`,
          ...(r => ({ note: r.reason, locked: !r.editable }))(editRule({ source: "direct", status: b.status, payment_status: b.payment_status, paid_cents: b.paid_cents })), rows: [
          ["Property / room", place(b.property_id)],
          ["Check-in", fmtDate(b.check_in, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) + (b.arrival_time ? ` · arriving ${b.arrival_time}` : "")],
          ["Check-out", fmtDate(b.check_out, { weekday: "short", month: "short", day: "numeric", year: "numeric" })],
          ["Nights", String(b.nights)],
          ["Guests", `${b.guests} (${partyLabel(b)})`],
          ["Booking code", b.code],
          ...(b.guest_phone ? [["Phone", b.guest_phone] as [string, string]] : []),
          ...(extrasOf(b).length ? [["Extra services", extrasOf(b).map(x => `${x.name}${x.qty > 1 && x.total ? ` × ${x.qty}` : ""} (${x.total ? money(x.total) : "free"})${x.details ? `, ${x.details}` : ""}`).join("; ")] as [string, string]] : []),
          ["Total", money(b.total_cents)],
        ] as [string, string][] },
        title: `Sevgio · ${b.code} · ${b.guest_name} · ${place(b.property_id)} · check-in ${fmtShort(b.check_in)}, check-out ${fmtShort(b.check_out)} · ${b.nights} night${b.nights === 1 ? "" : "s"} · ${b.guests} guest${b.guests === 1 ? "" : "s"} · ${st.label}` };
    }),
    ...blocks.map(b => {
      const ch = siteOf(b);
      const what = !ch ? "Blocked by you" : `${reservationStatus({ status: b.status, check_in: b.start_date, check_out: b.end_date, today: todayLocal(), kind: b.kind }).label} · ${ch.label}`;
      const href = ch ? `/host/bookings/other-sites/${b.id}` : `/host/listings/${b.property_id}/calendar`;
      // Dates blocked on another site have no guest arriving, so they count like your own blocked dates.
      return { key: (ch ? "c:" : "k:") + b.id, pid: b.property_id, from: b.start_date, to: b.end_date, kind: ch && b.kind !== "blocked" ? "ext" as const : "blk" as const,
        cls: ch ? `ch-${ch.key}${b.status === "cancelled" ? " cx" : ""}` : "blk", label: ch ? (b.guest ? `${ch.label} · ${b.guest}` : ch.label) : b.note || "Blocked", status: what, tone: "neutral",
        place: place(b.property_id), code: ch && b.ref ? b.ref : undefined,
        detail: { title: ch ? (b.guest || what) : "Blocked by you", badge: ch ? ch.label : "Blocked", badgeCls: `neutral ar-status ${ch ? `ch-${ch.key}` : ""}`, color: colorOf.get(b.property_id),
          href, hrefLabel: ch ? "View synced details" : "Edit blocked dates",
          ...(ch ? { note: editRule({ source: b.kind === "reservation" ? "external" : "block", status: b.status }).reason, locked: true } : {}), rows: [
          ["Property / room", place(b.property_id)],
          ...(ch ? [["Status", what] as [string, string]] : []),
          [ch ? "Check-in" : "From", fmtDate(b.start_date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })],
          [ch ? "Check-out" : "Until", fmtDate(b.end_date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })],
          ["Nights", String(nightsBetween(b.start_date, b.end_date))],
          ...(ch && b.ref ? [["Confirmation code", b.ref] as [string, string]] : []),
          ...(ch ? [["Guest", b.guest ? b.guest : b.kind === "reservation" ? `Name not provided by ${ch.label}` : "No guest details: dates only"] as [string, string]] : []),
          ...(ch && b.kind === "reservation" ? [["Payout", b.payout == null ? `Not provided by ${ch.label}` : money(b.payout)] as [string, string]] : []),
          ...(ch ? [["Messaging", b.kind === "reservation" ? `Not connected for ${ch.label}. Reply in the ${ch.label} app.` : "No guest: dates only"] as [string, string]] : []),
          ...(!ch && b.note ? [["Note", b.note] as [string, string]] : []),
        ] as [string, string][] },
        title: `${what}${b.guest ? ` · ${b.guest}` : ""} · ${place(b.property_id)} · ${fmtShort(b.start_date)} → ${fmtShort(b.end_date)}${b.ref ? ` · ${b.ref}` : ""}` };
    }),
  ];
}

const nightsLabel = (s: Stay) => { const n = nightsBetween(s.from, s.to); return `${n} night${n === 1 ? "" : "s"}`; };

/** How many reservations (and guests) check in on a day. Guests booked on other sites aren't shared with us, so those show as "+". */
function arrivalsOn(stays: Stay[], d: string) {
  const on = stays.filter(s => s.from === d && s.kind !== "blk");
  const guests = on.reduce((n, s) => n + (s.guests || 0), 0);
  return { count: on.length, guests, unknown: on.some(s => s.kind === "ext") };
}
const arrivalsText = (a: { count: number; guests: number; unknown: boolean }) =>
  `${a.count} arriving${a.guests ? ` · ${a.guests}${a.unknown ? "+" : ""} guest${a.guests === 1 && !a.unknown ? "" : "s"}` : ""}`;

/**
 * The Day, Week and 14/30/60-day boards: rooms down the side, days across the top, each stay a bar from the middle
 * of its check-in day to the middle of its check-out day. Overlapping stays stack in lanes, so nothing is hidden.
 */
function Timeline({ rows, stays, start, days, today, mode, basePath, colorOf, evTitle }: {
  rows: Prop[]; stays: Stay[]; start: string; days: number; today: string; mode: "day" | "week" | "range"; basePath: string; colorOf: Map<string, string>; evTitle: (d: string) => string | undefined;
}) {
  const wide = mode !== "range";
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const half = mode === "day" ? 120 : mode === "week" ? 48 : days > 30 ? 13 : 15;
  const shown = stays.filter(s => rows.some(p => p.id === s.pid));
  let r = 2;
  return (
    <div className={`mc-wrap mc-wrap-tl${mode === "day" ? " mc-wrap-day" : ""}`}>
      <div className={`mc mc-tl${wide ? " mc-v-week" : ""}${mode === "day" ? " mc-tl-day" : ""}`} style={{ gridTemplateColumns: `var(--mc-name-w) repeat(${days * 2}, minmax(${half}px, 1fr))` }}>
        <div className="mc-corner"><span className="nav-txt">Property / room</span></div>
        {dates.map((d, i) => {
          const dt = dayLabel(d), dow = dt.getUTCDay();
          const arr = arrivalsOn(shown, d);
          return (
            <div key={d} className={`mc-day${dow === 0 || dow === 6 ? " we" : ""}${d === today ? " today" : ""}`} style={{ gridColumn: `${2 + 2 * i} / span 2` }}>
              {mode === "day" ? <small>{dt.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}</small>
                : wide ? <small>{dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}{dt.getUTCDate() === 1 || i === 0 ? " " + dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) : ""}</small>
                : dt.getUTCDate() === 1 || d === start ? <small>{dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</small> : <small>{"SMTWTFS"[dow]}</small>}
              <b className={evTitle(d) ? "ev" : undefined} title={evTitle(d)}>{dt.getUTCDate()}</b>
              {wide && <span className={`mc-arr${arr.count ? "" : " none"}`}>{arr.count ? arrivalsText(arr) : "No arrivals"}</span>}
            </div>
          );
        })}
        {rows.map(p => {
          const { placed, lanes } = assignLanes(stays.filter(s => s.pid === p.id && inView(start, days, s)));
          const row = r; r += lanes;
          const span = `${row} / span ${lanes}`;
          return [
            <div key={p.id + "n"} className={`mc-name mc-name-ph${p.parent_id ? " room" : ""}`} style={{ gridRow: span, ["--pc" as string]: colorOf.get(p.id) }}>
              <Link href={`${basePath}?` + new URLSearchParams({ view: "month", start, ...(p.parent_id ? { property: p.parent_id, room: p.id } : { property: p.id }) })} title={`${p.title}: open its month calendar`} className="mc-ph"><Thumb p={p} /></Link>
              <div className="mc-name-txt">
                <Link href={`/host/listings/${p.id}/calendar`} title="Block dates on this listing">{p.parent_id ? "↳ " : ""}{p.title}</Link>
                <span className="hint">{p.city}{p.status !== "published" ? ` · ${p.status}` : ""}{lanes > 1 ? ` · ${placed.length} stays` : ""}</span>
              </div>
            </div>,
            ...dates.map((d, ci) => {
              const dow = dayLabel(d).getUTCDay();
              return <div key={p.id + d} className={`mc-cell${dow === 0 || dow === 6 ? " we" : ""}${d === today ? " today" : ""}`} style={{ gridRow: span, gridColumn: `${2 + 2 * ci} / span 2` }} />;
            }),
            ...placed.map(({ item: s, lane }) => {
              const at = barLines(start, days, s);
              const cls = `mc-bar ${s.cls}${at.cutL ? " cut-l" : " in"}${at.cutR ? " cut-r" : " out"}`;
              const style = { gridRow: row + lane, gridColumn: `${at.from} / ${at.to}` };
              // On the Day board, say whether the guest is arriving, staying or leaving that day.
              const lead = mode === "day" ? `${s.to === start ? "Leaving" : s.from === start ? "Arriving" : "Staying"}: ` : "";
              const guests = s.guests ? ` · ${s.guests} guest${s.guests === 1 ? "" : "s"}` : "";
              const body = wide ? (
                <>
                  <span className="mc-bar-name">{lead}{s.label}</span>
                  <span className="mc-bar-meta">{at.cutL && mode !== "day" ? "← " : ""}{mode === "day" && s.to !== start ? "" : `In ${fmtShort(s.from)} · `}Out {fmtShort(s.to)}{at.cutR && mode !== "day" ? " →" : ""}{guests}{s.kind === "res" ? ` · ${s.status}` : ""}</span>
                </>
              ) : <span>{s.label}</span>;
              return s.href
                ? <Link key={s.key} href={s.href} className={cls} style={style} title={s.title} data-stay={s.key}>{body}</Link>
                : <div key={s.key} className={cls} style={style} title={s.title} data-stay={s.key} role="button" tabIndex={0}>{body}</div>;
            }),
          ];
        })}
      </div>
    </div>
  );
}

/** Stays grouped under the day guests check in, earliest first: who is arriving, where, for how long, and the status. */
function ArrivalList({ stays, today, colorOf, empty, before, className }: { stays: Stay[]; today: string; colorOf: Map<string, string>; empty: string; before?: string; className?: string }) {
  const groups = groupByArrival(stays.map(s => ({ ...s, sortKey: s.place + " " + s.label })));
  if (!groups.length) return <div className={`empty ar-empty ${className || ""}`}><p className="muted">{empty}</p></div>;
  return (
    <div className={`ar ${className || ""}`}>
      {groups.map(g => (
        <section key={g.date} className="ar-day" aria-label={`Arriving ${fmtDate(g.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`}>
          <h3 className="ar-date">
            {fmtDate(g.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            {g.date === today && <span className="pill ok">Today</span>}
            {before && g.date < before && <span className="hint"> · arrived earlier, still staying</span>}
            <span className="ar-count">{(() => { const a = arrivalsOn(g.items, g.date); const n = g.items.length;
              return `${n} ${n === 1 ? "arrival" : "arrivals"}${a.guests ? ` · ${a.guests}${a.unknown ? "+" : ""} guest${a.guests === 1 && !a.unknown ? "" : "s"}` : ""}`; })()}</span>
          </h3>
          <ul className="ar-list">
            {g.items.map(s => {
              const inner = (
                <>
                  <span className="ar-top">
                    <b className="ar-guest">{s.kind === "res" ? s.label : s.status}</b>
                    <span className={`pill ${s.kind === "res" ? s.tone : "neutral"} ar-status ${s.kind !== "res" ? s.cls : ""}`}>{s.kind === "res" ? s.status : s.label}</span>
                  </span>
                  <span className="ar-place"><i className="ar-dot" aria-hidden />{s.place}</span>
                  <span className="ar-dates">
                    <span><span className="ar-k">Check-in</span> {fmtDate(s.from, { weekday: "short", month: "short", day: "numeric" })}</span>
                    <span aria-hidden>→</span>
                    <span><span className="ar-k">Check-out</span> {fmtDate(s.to, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                  </span>
                  <span className="ar-meta">{nightsLabel(s)}{s.guests ? ` · ${s.guests} guest${s.guests === 1 ? "" : "s"}` : ""}{s.code ? ` · ${s.code}` : ""}</span>
                </>
              );
              return (
                <li key={s.key} style={{ ["--pc" as string]: colorOf.get(s.pid) }}>
                  {s.href ? <Link href={s.href} className="ar-card" title={s.title} data-stay={s.key}>{inner}</Link>
                    : <div className="ar-card" title={s.title} data-stay={s.key} role="button" tabIndex={0}>{inner}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** What the Settings panel beside a listing's month shows. */
async function settingsFor(p: Prop, res: Res[], blocks: Blk[], start: string, end: string, today: string): Promise<CalSettingsData> {
  const [x] = await q<{ monthly_price_cents: number | null; weekly_discount_percent: string; monthly_discount_percent: string; cleaning_fee_cents: number; extra_guest_fee_cents: number;
    pet_fee_cents: number; security_deposit_cents: number; min_nights: number; max_nights: number; booking_mode: string; base_occupancy: number | null; blocks: number; feeds: number }>(
    `SELECT monthly_price_cents, weekly_discount_percent, monthly_discount_percent, cleaning_fee_cents, extra_guest_fee_cents, pet_fee_cents, security_deposit_cents,
            min_nights, max_nights, booking_mode, base_occupancy,
            (SELECT count(*)::int FROM blocks k WHERE k.property_id = p.id AND k.source = 'host' AND k.end_date > $2) AS blocks,
            (SELECT count(*)::int FROM ical_feeds f WHERE f.property_id = p.id) AS feeds
     FROM properties p WHERE p.id = $1`, [p.id, today]);
  const taken = new Set<string>();
  for (const r of [...res.filter(b => b.property_id === p.id || b.property_id === p.parent_id).map(b => [b.check_in, b.check_out]),
    ...blocks.filter(b => b.property_id === p.id || b.property_id === p.parent_id).map(b => [b.start_date, b.end_date])])
    for (let d = r[0] < start ? start : r[0]; d < r[1] && d < end; d = addDays(d, 1)) taken.add(d);
  const fees = [
    x.cleaning_fee_cents ? { label: "Cleaning", value: money(x.cleaning_fee_cents) } : null,
    x.extra_guest_fee_cents ? { label: "Extra guests", value: `${money(x.extra_guest_fee_cents)} per guest a night${x.base_occupancy ? ` after ${x.base_occupancy}` : ""}` } : null,
    x.pet_fee_cents ? { label: "Pets", value: money(x.pet_fee_cents) } : null,
    x.security_deposit_cents ? { label: "Security deposit", value: `${money(x.security_deposit_cents)} (refundable)` } : null,
  ].filter((f): f is { label: string; value: string } => !!f);
  return {
    id: p.id, title: p.title, status: p.status,
    base: money(x.monthly_price_cents || p.nightly_price_cents), baseUnit: x.monthly_price_cents ? "month" : "night",
    sp: { id: p.id, on: p.smart_pricing, min: p.min_price_cents ? String(p.min_price_cents / 100) : "", max: p.max_price_cents ? String(p.max_price_cents / 100) : "", base: money(p.nightly_price_cents), monthly: !!x.monthly_price_cents },
    smart: p.smart_pricing && !x.monthly_price_cents ? { min: money(p.min_price_cents || 0), max: money(p.max_price_cents || 0) } : null,
    weekly: Number(x.weekly_discount_percent), monthly: Number(x.monthly_discount_percent), fees,
    minNights: x.min_nights, maxNights: x.max_nights, instant: x.booking_mode === "instant",
    month: { label: fmtDate(start, { month: "long", year: "numeric" }), booked: taken.size, nights: nightsBetween(start, end) },
    blocks: x.blocks, feeds: x.feeds,
  };
}

function Thumb({ p }: { p: Prop }) {
  return p.cover_id
    ? <img src={`/api/photos/${p.cover_id}?s=thumb`} alt="" loading="lazy" width={48} height={48} />
    : <span className="mc-noph" aria-hidden>{p.title.slice(0, 1)}</span>;
}

const money = (c: number) => "$" + (c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });

/** A day number; today is filled gold, event and holiday days get a red circle (hover to see what's on). */
function MgNum({ d, today, demand }: { d: string; today: string; demand: Demand }) {
  const ev = demand[d]?.notable ? demand[d].reasons.join(" · ") : "";
  return <span className={`mg-num${d === today ? " today" : ""}${ev ? " ev" : ""}`} title={ev || undefined}>{Number(d.slice(8))}{ev && <span className="sr-only"> ({ev})</span>}</span>;
}

/** One property's month, laid out like a wall calendar: each day shows its price, or who is staying. */
function MonthGrid({ p, res, blocks, start, end, today, demand, prices }: { p: Prop; res: Res[]; blocks: Blk[]; start: string; end: string; today: string; demand: Demand; prices?: Record<string, number> }) {
  type Stay = { key: string; from: string; to: string; cls: string; label: string; href?: string; title: string };
  const stays: Stay[] = [
    ...res.filter(b => b.property_id === p.id || b.property_id === p.parent_id).map(b => ({
      key: "b:" + b.id, from: b.check_in, to: b.check_out, cls: b.property_id !== p.id ? "blk" : b.status === "confirmed" ? "ok" : "warn",
      label: b.property_id !== p.id ? "Whole house booked" : b.guest_name, href: b.property_id === p.id ? `/trips/${b.code}` : undefined,
      title: `${b.guest_name} · ${b.check_in} → ${b.check_out} · ${b.guests} guests${b.status === "pending" ? " · awaiting approval" : b.status === "awaiting_payment" ? " · awaiting payment" : ""}` })),
    ...blocks.filter(b => b.property_id === p.id || b.property_id === p.parent_id).map(b => {
      const ch = siteOf(b);
      return { key: (ch ? "c:" : "k:") + b.id, from: b.start_date, to: b.end_date, cls: ch ? `ch-${ch.key}` : "blk",
        label: b.property_id !== p.id ? "Whole house blocked" : ch ? ch.label : b.note || "Blocked", title: `${ch ? `Booked on ${ch.label}` : b.note || "Blocked"}: ${b.start_date} → ${b.end_date}` };
    }),
  ];
  const lead = dayLabel(start).getUTCDay();
  const dates: string[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) dates.push(d);
  return (
    <div className="mg" role="grid" aria-label={`${p.title} month calendar`}>
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(w => <div key={w} className="mg-dow" role="columnheader">{w}</div>)}
      {Array.from({ length: lead }, (_, i) => <div key={"x" + i} className="mg-blank" />)}
      {dates.map(d => {
        const s = stays.find(x => x.from <= d && d < x.to);
        const priced = { ...p, demand, prices };
        const price = nightPrice(priced, d, today);
        const tone = prices?.[d] ? " set" : price > p.nightly_price_cents ? " smart" : price < p.nightly_price_cents ? " down" : "";
        const first = s && (s.from === d || d === start || dayLabel(d).getUTCDay() === 0);
        const inner = s ? (
          <span className={`mg-bar ${s.cls}${s.from === d ? " s" : ""}${addDays(d, 1) === s.to ? " e" : ""}`} title={s.title}>{first ? s.label : "\u00a0"}</span>
        ) : <span className={`mg-price${tone}`} data-price={d} title={priceWhy(priced, d, today)}>{money(price)}</span>;
        return (
          <div key={d} role="gridcell" className={`mg-day${d < today ? " past" : ""}${s ? " booked" : ""}`}>
            <MgNum d={d} today={today} demand={demand} />
            {s?.href ? <Link href={s.href} className="mg-link" data-stay={s.key}>{inner}</Link>
              : s ? <span className="mg-link" data-stay={s.key} role="button" tabIndex={0}>{inner}</span> : inner}
          </div>
        );
      })}
    </div>
  );
}

/** Every property's month on one wall calendar: each night lists every listing that is booked or blocked (none hidden). Tap a day for details. */
function AllMonthGrid({ rows, stays, start, end, today, demand, colorOf, dayHref }: { rows: Prop[]; stays: Stay[]; start: string; end: string; today: string; demand: Demand; colorOf: Map<string, string>; dayHref: (d: string) => string }) {
  const order = new Map(rows.map((r, i) => [r.id, i]));
  const tags = stays.filter(s => order.has(s.pid)).sort((a, b) => order.get(a.pid)! - order.get(b.pid)! || a.from.localeCompare(b.from));
  const lead = dayLabel(start).getUTCDay();
  const dates: string[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) dates.push(d);
  return (
    <div className="mg mg-all" role="grid" aria-label="All properties month calendar">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(w => <div key={w} className="mg-dow" role="columnheader">{w}</div>)}
      {Array.from({ length: lead }, (_, i) => <div key={"x" + i} className="mg-blank" />)}
      {dates.map(d => {
        const on = tags.filter(t => t.from <= d && d < t.to);
        const arr = arrivalsOn(on, d);
        return (
          <div key={d} role="gridcell" className={`mg-day mg-link-day${d < today ? " past" : ""}`}>
            <Link href={dayHref(d)} className="mg-daylink" aria-label={`${fmtDate(d)}: ${on.length ? `${on.length} booked${arr.count ? `, ${arrivalsText(arr)}` : ""}` : "all free"}. Open this day`}>
              <MgNum d={d} today={today} demand={demand} />
              {arr.count > 0 && <span className="mg-arr">{arrivalsText(arr)}</span>}
            </Link>
            <span className="mg-tags">
              {on.map(t => (
                <span key={t.key} className={`mg-tag ${t.cls}${t.from === d ? " arr" : ""}`} style={{ ["--pc" as string]: colorOf.get(t.pid) }} title={t.title}
                  data-stay={t.key} role="button" tabIndex={0}>
                  <i className="ar-dot" aria-hidden />{t.from === d && <span className="sr-only">Arriving: </span>}{t.kind === "res" ? `${t.label} · ` : ""}{t.place.split(" › ").pop()}
                </span>
              ))}
            </span>
            {on.length > 0 && <span className="mg-count">{on.length} booked{arr.count ? ` · ${arr.count} in` : ""}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Phones: a small month per house and room, like the Availability screen in booking apps. Green is free, red is booked, amber is waiting on approval or payment. */
function MiniMonths({ rows, stays, start, end, today, colorOf, basePath }: { rows: Prop[]; stays: Stay[]; start: string; end: string; today: string; colorOf: Map<string, string>; basePath: string }) {
  const lead = dayLabel(start).getUTCDay();
  const dates: string[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) dates.push(d);
  return (
    <div className="mm mc-phone-only">
      <p className="hint mm-key"><i className="mm-k free" />Free <i className="mm-k bk" />Booked <i className="mm-k wt" />Waiting <i className="mm-k cx-k" />Blocked</p>
      <div className="mm-grid">
        {rows.map(p => {
          // Booking the whole house also takes its rooms.
          const mine = stays.filter(s => s.pid === p.id || (p.parent_id && s.pid === p.parent_id));
          const href = `${basePath}?` + new URLSearchParams({ view: "month", start, ...(p.parent_id ? { property: p.parent_id, room: p.id } : { property: p.id }) });
          return (
            <Link key={p.id} href={href} className="mm-one" style={{ ["--pc" as string]: colorOf.get(p.id) }} aria-label={`${p.title}: open its month`}>
              <span className="mm-cal" aria-hidden>
                {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => <span key={i} className="mm-dow">{w}</span>)}
                {Array.from({ length: lead }, (_, i) => <span key={"x" + i} />)}
                {dates.map(d => {
                  const s = mine.find(x => x.from <= d && d < x.to);
                  const c = !s ? "free" : s.kind === "blk" ? "bl" : s.cls === "warn" ? "wt" : s.cls === "cx" ? "free" : "bk";
                  return <span key={d} className={`mm-d ${c}${d < today ? " past" : ""}${d === today ? " today" : ""}`}>{Number(d.slice(8))}</span>;
                })}
              </span>
              <span className="mm-name"><i className="ar-dot" />{p.parent_id ? "↳ " : ""}{p.title}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

import Link from "next/link";
import type { User } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { addDays, fmtDate, fmtShort, isIsoDate, nightsBetween, todayLocal } from "@/lib/dates.ts";
import { demandBetween } from "@/lib/demand.ts";
import { nightPrice, type Demand } from "@/lib/smart-pricing.ts";
import { AutoSubmit } from "./AutoSubmit.tsx";
import { CalSettings, type CalSettingsData } from "./CalSettings.tsx";
import { BOOKING_STATUS } from "@/lib/constants.ts";
import { assignLanes, barLines, groupByArrival, inView, propertyColor } from "@/lib/cal-layout.ts";

type Prop = { id: string; title: string; city: string; parent_id: string | null; status: string; cover_id: string | null; nightly_price_cents: number; smart_pricing: boolean; min_price_cents: number | null; max_price_cents: number | null };
type Res = { id: string; code: string; property_id: string; check_in: string; check_out: string; status: string; guest_name: string; guests: number; nights: number };
type Blk = { id: string; property_id: string; start_date: string; end_date: string; note: string; source: string; feed_name: string | null };

/** Which booking site an imported block came from, by the calendar link's name. */
export function channelOf(feedName: string | null): { key: string; label: string } {
  const n = (feedName || "").toLowerCase();
  if (n.includes("airbnb")) return { key: "airbnb", label: "Airbnb" };
  if (n.includes("booking")) return { key: "bookingcom", label: "Booking.com" };
  if (n.includes("vrbo") || n.includes("homeaway")) return { key: "vrbo", label: "Vrbo" };
  if (n.includes("furnished")) return { key: "furnished", label: "Furnished Finder" };
  return { key: "other", label: feedName || "Other site" };
}

const COLS = `id, title, city, parent_id, status, nightly_price_cents, smart_pricing, min_price_cents, max_price_cents,
  (SELECT ph.id FROM photos ph WHERE ph.property_id = p.id ORDER BY ph.position, ph.created_at LIMIT 1) AS cover_id`;
const LENGTHS = [14, 30, 60];
const VIEWS = [["day", "Day"], ["week", "Week"], ["month", "Month"], ["arrivals", "Arrivals"]] as const;
type View = "day" | "week" | "month" | "arrivals" | "range";
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

/** Reservations calendar: Day, Week and Month boards, plus an Arrivals list grouped by check-in day. */
export async function MultiCalendar({ u, basePath, sp }: { u: User; basePath: string; sp: CalParams }) {
  const today = todayLocal();
  const anchor = isIsoDate(sp.start) ? sp.start! : null;
  // Older links used ?days=14/30/60; they still work as a plain date range.
  const view: View = sp.view === "day" || sp.view === "week" || sp.view === "month" || sp.view === "arrivals" ? sp.view
    : LENGTHS.includes(Number(sp.days)) ? "range" : "month";
  const status = STATUSES.some(([v]) => v === sp.status) ? sp.status! : "";
  let start: string, days: number, prev: string, next: string, todayStart: string;
  if (view === "day") {
    start = anchor || today; days = 1; prev = addDays(start, -1); next = addDays(start, 1); todayStart = today;
  } else if (view === "week") {
    start = anchor || today; days = 7; prev = addDays(start, -7); next = addDays(start, 7); todayStart = today;
  } else if (view === "month" || view === "arrivals") {
    // Month is a wall calendar: the whole calendar month, Sunday to Saturday. Arrivals lists the same month.
    start = monthStart(anchor || today); days = nightsBetween(start, nextMonth(start)); prev = prevMonth(start); next = nextMonth(start); todayStart = monthStart(today);
  } else {
    days = Number(sp.days); start = anchor || today; prev = addDays(start, -days); next = addDays(start, days); todayStart = today;
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
        q<Res>(`SELECT id, code, property_id, check_in, check_out, status, guest_name, guests, nights FROM bookings
                WHERE property_id = ANY($1) AND status = ANY($4) AND check_in < $3 AND check_out >= $2`,
          [ids, start, end, status === "cancelled" ? ["cancelled"] : ["pending", "awaiting_payment", "confirmed"]]),
        q<Blk>(`SELECT k.id, k.property_id, k.start_date, k.end_date, k.note, k.source, f.name AS feed_name FROM blocks k
                LEFT JOIN ical_feeds f ON k.source = 'ical:' || f.id::text
                WHERE k.property_id = ANY($1) AND k.start_date < $3 AND k.end_date >= $2`, [ids, start, end]),
      ])
    : [[], []];
  // The status filter: one booking status, bookings from other sites, or dates you blocked.
  const res = allRes.filter(b => !status || status === b.status);
  const blocks = allBlocks.filter(b => !status || (status === "other" && b.source.startsWith("ical")) || (status === "blocked" && !b.source.startsWith("ical")));
  const stays = toStays(res, blocks, byId, placeName);

  const link = (s: string, v: View = view) =>
    `${basePath}?` + new URLSearchParams({ view: v, start: s, ...(v === "range" ? { days: String(days) } : {}), ...(picked ? { property: picked.id } : {}),
      ...(room ? { room: room.id } : {}), ...(status ? { status } : {}) });
  const period = view === "day" ? fmtDate(start, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : (view === "month" || view === "arrivals") && start.endsWith("-01") && end === nextMonth(start) ? fmtDate(start, { month: "long", year: "numeric" })
    : `${fmtShort(start)} - ${fmtDate(addDays(end, -1), { month: "short", day: "numeric", year: "numeric" })}`;
  const unit = view === "day" ? "day" : view === "week" ? "week" : view === "month" || view === "arrivals" ? "month" : "";
  const arrivalsToday = res.filter(r => r.check_in === today).length, departuresToday = res.filter(r => r.check_out === today).length;
  const inHouse = res.filter(r => r.check_in <= today && r.check_out > today && r.status === "confirmed").length;
  // On phones the boards become a list of stays in view, grouped by arrival day. Dates you blocked are left out.
  const listed = stays.filter(s => s.kind !== "blk" || status === "blocked");
  const phoneList = <ArrivalList className="mc-phone-list" stays={listed.filter(s => s.from < end && s.to > start)} today={today} colorOf={colorOf} before={start}
    empty={`Nothing booked ${view === "week" ? "this week" : `in ${period}`}.`} />;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="cal-top">
        <Link className="btn btn-ghost btn-sm cal-today" href={link(todayStart)}>Today</Link>
        <div className="cal-step">
          <Link className="cal-arrow" href={link(prev)} aria-label={unit ? `Previous ${unit}` : "Earlier"}>‹</Link>
          <h2 className="mc-period">{view === "arrivals" ? `Arrivals · ${period}` : period}</h2>
          <Link className="cal-arrow" href={link(next)} aria-label={unit ? `Next ${unit}` : "Later"}>›</Link>
        </div>
        <nav className="cal-tabs" aria-label="Calendar view">
          {VIEWS.map(([v, label]) => (
            <Link key={v} aria-current={view === v ? "page" : undefined} href={link(v === "day" || v === "week" ? (start <= today && today < end ? today : start) : start, v)}>{label}</Link>
          ))}
        </nav>
      </div>
      <form className="cal-prop cal-filters" method="get" action={basePath}>
        <AutoSubmit />
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="start" value={start} />
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
        <label className="cal-field">
          <span className="cal-field-l">Status</span>
          <select className="input" name="status" defaultValue={status}>
            {STATUSES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
        <noscript><button className="btn btn-ghost">Show</button></noscript>
      </form>
      {view !== "arrivals" && Object.values(demand).some(x => x.notable) && <p className="hint mc-legend"><span className="ev-dot" aria-hidden /> Red circle: a game, big event or holiday in Pittsburgh. Hover or tap the date to see it.{selected?.smart_pricing ? " Smart pricing is on: prices in gold are adjusted for demand." : ""}</p>}

      {rows.length === 0 ? <div className="empty"><p className="muted">No listings yet.</p></div> : view === "arrivals" ? (
        <ArrivalList stays={listed.filter(s => s.from >= start && s.from < end)} today={today} colorOf={colorOf} empty={`No arrivals in ${period}.`} />
      ) : selected && view === "month" ? (
        <div className="cal-split">
          <MonthGrid p={selected} res={res} blocks={blocks} start={start} end={end} today={today} demand={demand} />
          <CalSettings d={await settingsFor(selected, allRes, allBlocks, start, end, today)} />
        </div>
      ) : view === "month" ? (
        <>
          <AllMonthGrid rows={rows} stays={stays} start={start} end={end} today={today} demand={demand} colorOf={colorOf} dayHref={d => link(d, "day")} />
          {phoneList}
        </>
      ) : view === "day" ? (
        <DayBoard rows={rows} stays={stays} day={start} today={today} basePath={basePath} colorOf={colorOf} evTitle={evTitle} />
      ) : (
        <>
          <Timeline rows={rows} stays={stays} start={start} days={days} today={today} wide={view === "week"} basePath={basePath} colorOf={colorOf} evTitle={evTitle} />
          {phoneList}
        </>
      )}
      <div className="row" style={{ gap: 20 }}>
        <span><b>{arrivalsToday}</b> <span className="muted">arriving today</span></span>
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
      <p className="hint">{view === "day" ? "Tap a guest to open the reservation, or a property name to block dates."
        : view === "arrivals" ? "Guests are grouped by the day they check in. Tap a reservation to open it."
        : <>Each bar starts halfway through the check-in day and ends halfway through the check-out day, so a guest leaving and the next arriving share that day. Click a reservation to open it. The colored edge beside each name is that listing&apos;s color. Rooms are listed under their house; booking the house blocks its rooms.</>}</p>
    </div>
  );
}

export type CalParams = { start?: string; days?: string; property?: string; room?: string; status?: string; view?: string };

/** A reservation or blocked dates, ready to draw. `from`/`to` are check-in and check-out days. */
type Stay = {
  key: string; pid: string; from: string; to: string; kind: "res" | "ext" | "blk"; cls: string; label: string; status: string; tone: string;
  place: string; href?: string; title: string; guests?: number; code?: string;
};

function toStays(res: Res[], blocks: Blk[], byId: Map<string, Prop>, placeName: (p: Prop) => string): Stay[] {
  const place = (id: string) => { const p = byId.get(id); return p ? placeName(p) : ""; };
  return [
    ...res.map(b => {
      const st = BOOKING_STATUS[b.status] || { label: b.status, tone: "neutral" };
      return { key: b.id, pid: b.property_id, from: b.check_in, to: b.check_out, kind: "res" as const,
        cls: b.status === "confirmed" ? "ok" : b.status === "cancelled" ? "cx" : "warn", label: b.guest_name, status: st.label, tone: st.tone,
        place: place(b.property_id), href: `/trips/${b.code}`, guests: b.guests, code: b.code,
        title: `Sevgio · ${b.code} · ${b.guest_name} · ${place(b.property_id)} · check-in ${fmtShort(b.check_in)}, check-out ${fmtShort(b.check_out)} · ${b.nights} night${b.nights === 1 ? "" : "s"} · ${b.guests} guest${b.guests === 1 ? "" : "s"} · ${st.label}` };
    }),
    ...blocks.map(b => {
      const ch = b.source.startsWith("ical") ? channelOf(b.feed_name || b.note.split(":")[0]) : null;
      const detail = ch && b.note.includes(":") ? b.note.split(":").slice(1).join(":").trim() : "";
      return { key: b.id, pid: b.property_id, from: b.start_date, to: b.end_date, kind: ch ? "ext" as const : "blk" as const,
        cls: ch ? `ch-${ch.key}` : "blk", label: ch ? ch.label : b.note || "Blocked", status: ch ? `Booked on ${ch.label}` : "Blocked by you", tone: "neutral",
        place: place(b.property_id),
        title: `${ch ? `Booked on ${ch.label}` : b.note || "Blocked"} · ${place(b.property_id)} · ${fmtShort(b.start_date)} → ${fmtShort(b.end_date)}${detail ? ` · ${detail}` : ""}` };
    }),
  ];
}

const nightsLabel = (s: Stay) => { const n = nightsBetween(s.from, s.to); return `${n} night${n === 1 ? "" : "s"}`; };

/** The week (or 14/30/60-day) board: rooms down the side, days across the top, each stay a bar. Overlapping stays stack in lanes, so nothing is hidden. */
function Timeline({ rows, stays, start, days, today, wide, basePath, colorOf, evTitle }: {
  rows: Prop[]; stays: Stay[]; start: string; days: number; today: string; wide: boolean; basePath: string; colorOf: Map<string, string>; evTitle: (d: string) => string | undefined;
}) {
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const half = wide ? 48 : days > 30 ? 13 : 15;
  let r = 2;
  return (
    <div className="mc-wrap mc-wrap-tl">
      <div className={`mc mc-tl${wide ? " mc-v-week" : ""}`} style={{ gridTemplateColumns: `var(--mc-name-w) repeat(${days * 2}, minmax(${half}px, 1fr))` }}>
        <div className="mc-corner"><span className="nav-txt">Property / room</span></div>
        {dates.map((d, i) => {
          const dt = dayLabel(d), dow = dt.getUTCDay();
          return (
            <div key={d} className={`mc-day${dow === 0 || dow === 6 ? " we" : ""}${d === today ? " today" : ""}`} style={{ gridColumn: `${2 + 2 * i} / span 2` }}>
              {wide ? <small>{dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}{dt.getUTCDate() === 1 || i === 0 ? " " + dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) : ""}</small>
                : dt.getUTCDate() === 1 || d === start ? <small>{dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</small> : <small>{"SMTWTFS"[dow]}</small>}
              <b className={evTitle(d) ? "ev" : undefined} title={evTitle(d)}>{dt.getUTCDate()}</b>
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
              const body = wide ? (
                <>
                  <span className="mc-bar-name">{s.label}</span>
                  <span className="mc-bar-meta">{at.cutL ? "← " : ""}In {fmtShort(s.from)} · Out {fmtShort(s.to)}{at.cutR ? " →" : ""}{s.kind === "res" ? ` · ${s.status}` : ""}</span>
                </>
              ) : <span>{s.label}</span>;
              return s.href
                ? <Link key={s.key} href={s.href} className={cls} style={style} title={s.title}>{body}</Link>
                : <div key={s.key} className={cls} style={style} title={s.title}>{body}</div>;
            }),
          ];
        })}
      </div>
    </div>
  );
}

/** One day: each listing with who is arriving, staying and leaving, one line each. */
function DayBoard({ rows, stays, day, today, basePath, colorOf, evTitle }: {
  rows: Prop[]; stays: Stay[]; day: string; today: string; basePath: string; colorOf: Map<string, string>; evTitle: (d: string) => string | undefined;
}) {
  const dt = dayLabel(day);
  const order = (s: Stay) => (s.to === day ? 2 : s.from === day ? 0 : 1);
  return (
    <div className="mc-wrap">
      <div className="mc mc-v-day" style={{ gridTemplateColumns: "minmax(150px, 55%) minmax(110px, 1fr)" }}>
        <div className="mc-corner"><span className="nav-txt">Property / room</span></div>
        <div className={`mc-day${day === today ? " today" : ""}`}>
          <small>{dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</small>
          <b className={evTitle(day) ? "ev" : undefined} title={evTitle(day)}>{dt.getUTCDate()}</b>
        </div>
        {rows.flatMap(p => {
          const on = stays.filter(s => s.pid === p.id && s.from <= day && day <= s.to && s.from < s.to).sort((a, b) => order(a) - order(b));
          return [
            <div key={p.id + "n"} className={`mc-name mc-name-ph${p.parent_id ? " room" : ""}`} style={{ ["--pc" as string]: colorOf.get(p.id) }}>
              <Link href={`${basePath}?` + new URLSearchParams({ view: "month", start: day, ...(p.parent_id ? { property: p.parent_id, room: p.id } : { property: p.id }) })} title={`${p.title}: open its month calendar`} className="mc-ph"><Thumb p={p} /></Link>
              <div className="mc-name-txt">
                <Link href={`/host/listings/${p.id}/calendar`} title="Block dates on this listing">{p.parent_id ? "↳ " : ""}{p.title}</Link>
                <span className="hint">{p.city}{p.status !== "published" ? ` · ${p.status}` : ""}</span>
              </div>
            </div>,
            <div key={p.id + "c"} className="mc-cell mc-daylist">
              {on.map(s => {
                const leaving = s.to === day;
                const text = `${leaving ? "Leaving" : s.from === day ? "Arriving" : "Staying"}: ${s.label}`;
                const cls = leaving ? "mc-leave" : `mc-bar ${s.cls}`;
                return s.href ? <Link key={s.key} href={s.href} className={cls} title={s.title}>{leaving ? text : <span>{text}</span>}</Link>
                  : <div key={s.key} className={cls} title={s.title}>{leaving ? text : <span>{text}</span>}</div>;
              })}
            </div>,
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
            <span className="ar-count">{g.items.length} {g.items.length === 1 ? "arrival" : "arrivals"}</span>
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
                  {s.href ? <Link href={s.href} className="ar-card" title={s.title}>{inner}</Link> : <div className="ar-card" title={s.title}>{inner}</div>}
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
function MonthGrid({ p, res, blocks, start, end, today, demand }: { p: Prop; res: Res[]; blocks: Blk[]; start: string; end: string; today: string; demand: Demand }) {
  type Stay = { key: string; from: string; to: string; cls: string; label: string; href?: string; title: string };
  const stays: Stay[] = [
    ...res.filter(b => b.property_id === p.id || b.property_id === p.parent_id).map(b => ({
      key: b.id, from: b.check_in, to: b.check_out, cls: b.property_id !== p.id ? "blk" : b.status === "confirmed" ? "ok" : "warn",
      label: b.property_id !== p.id ? "Whole house booked" : b.guest_name, href: b.property_id === p.id ? `/trips/${b.code}` : undefined,
      title: `${b.guest_name} · ${b.check_in} → ${b.check_out} · ${b.guests} guests${b.status === "pending" ? " · awaiting approval" : b.status === "awaiting_payment" ? " · awaiting payment" : ""}` })),
    ...blocks.filter(b => b.property_id === p.id || b.property_id === p.parent_id).map(b => {
      const ch = b.source.startsWith("ical") ? channelOf(b.feed_name || b.note.split(":")[0]) : null;
      return { key: b.id, from: b.start_date, to: b.end_date, cls: ch ? `ch-${ch.key}` : "blk",
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
        const price = nightPrice({ ...p, demand }, d, today);
        const first = s && (s.from === d || d === start || dayLabel(d).getUTCDay() === 0);
        const inner = s ? (
          <span className={`mg-bar ${s.cls}${s.from === d ? " s" : ""}${addDays(d, 1) === s.to ? " e" : ""}`} title={s.title}>{first ? s.label : "\u00a0"}</span>
        ) : <span className={`mg-price${p.smart_pricing && price !== p.nightly_price_cents ? " smart" : ""}`}>{money(price)}</span>;
        return (
          <div key={d} role="gridcell" className={`mg-day${d < today ? " past" : ""}${s ? " booked" : ""}`}>
            <MgNum d={d} today={today} demand={demand} />
            {s?.href ? <Link href={s.href} className="mg-link">{inner}</Link> : inner}
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
        const arriving = on.filter(t => t.from === d).length;
        return (
          <Link key={d} href={dayHref(d)} role="gridcell" className={`mg-day mg-link-day${d < today ? " past" : ""}`}
            aria-label={`${fmtDate(d)}: ${on.length ? `${on.length} booked${arriving ? `, ${arriving} arriving` : ""}` : "all free"}`}>
            <MgNum d={d} today={today} demand={demand} />
            <span className="mg-tags">
              {on.map(t => (
                <span key={t.key} className={`mg-tag ${t.cls}${t.from === d ? " arr" : ""}`} style={{ ["--pc" as string]: colorOf.get(t.pid) }} title={t.title}>
                  <i className="ar-dot" aria-hidden />{t.from === d && <span className="sr-only">Arriving: </span>}{t.kind === "res" ? `${t.label} · ` : ""}{t.place.split(" › ").pop()}
                </span>
              ))}
            </span>
            {on.length > 0 && <span className="mg-count">{on.length} booked{arriving ? ` · ${arriving} in` : ""}</span>}
          </Link>
        );
      })}
    </div>
  );
}

import Link from "next/link";
import type { User } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { addDays, fmtDate, fmtShort, isIsoDate, nightsBetween, todayLocal } from "@/lib/dates.ts";

type Prop = { id: string; title: string; city: string; parent_id: string | null; status: string; cover_id: string | null; nightly_price_cents: number };
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

const COLS = `id, title, city, parent_id, status, nightly_price_cents,
  (SELECT ph.id FROM photos ph WHERE ph.property_id = p.id ORDER BY ph.position, ph.created_at LIMIT 1) AS cover_id`;
const LENGTHS = [14, 30, 60];
const VIEWS = [["day", "Day"], ["week", "Week"], ["month", "Month"]] as const;
type View = "day" | "week" | "month" | "range";
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

/** Planner board: one row per listing, one column per day, reservations as bars. Day view lists each listing's day. */
export async function MultiCalendar({ u, basePath, sp }: { u: User; basePath: string; sp: { start?: string; days?: string; property?: string; view?: string } }) {
  const today = todayLocal();
  const anchor = isIsoDate(sp.start) ? sp.start! : null;
  // Older links used ?days=14/30/60; they still work as a plain date range.
  const view: View = sp.view === "day" || sp.view === "week" || sp.view === "month" ? sp.view
    : LENGTHS.includes(Number(sp.days)) ? "range" : "month";
  let start: string, days: number, prev: string, next: string, todayStart: string;
  if (view === "day") {
    start = anchor || today; days = 1; prev = addDays(start, -1); next = addDays(start, 1); todayStart = today;
  } else if (view === "week") {
    start = anchor || today; days = 7; prev = addDays(start, -7); next = addDays(start, 7); todayStart = today;
  } else if (view === "month") {
    // Month is a wall calendar: the whole calendar month, Sunday to Saturday.
    start = monthStart(anchor || today); days = nightsBetween(start, nextMonth(start)); prev = prevMonth(start); next = nextMonth(start); todayStart = monthStart(today);
  } else {
    days = Number(sp.days); start = anchor || today; prev = addDays(start, -days); next = addDays(start, days); todayStart = today;
  }
  const end = addDays(start, days);

  const all = await (u.role === "admin"
    ? q<Prop>(`SELECT ${COLS} FROM properties p`)
    : q<Prop>(`SELECT ${COLS} FROM properties p WHERE host_id = $1`, [u.id]));
  // Whole homes sorted by name, each followed by its rooms.
  const homes = all.filter(p => !p.parent_id || !all.some(h => h.id === p.parent_id)).sort((a, b) => a.title.localeCompare(b.title));
  const ordered = homes.flatMap(h => [h, ...all.filter(r => r.parent_id === h.id).sort((a, b) => a.title.localeCompare(b.title))]);
  const selected = ordered.find(p => p.id === sp.property);
  // Choosing a whole home also shows its rooms (their calendars are linked).
  const rows = selected ? ordered.filter(p => p.id === selected.id || p.parent_id === selected.id) : ordered;
  // A room's calendar also shows its house's stays (booking the house blocks the room).
  const ids = [...rows.map(r => r.id), ...(selected?.parent_id ? [selected.parent_id] : [])];

  const [res, blocks] = ids.length
    ? await Promise.all([
        q<Res>(`SELECT id, code, property_id, check_in, check_out, status, guest_name, guests, nights FROM bookings
                WHERE property_id = ANY($1) AND status IN ('pending','awaiting_payment','confirmed') AND check_in < $3 AND check_out >= $2`, [ids, start, end]),
        q<Blk>(`SELECT k.id, k.property_id, k.start_date, k.end_date, k.note, k.source, f.name AS feed_name FROM blocks k
                LEFT JOIN ical_feeds f ON k.source = 'ical:' || f.id::text
                WHERE k.property_id = ANY($1) AND k.start_date < $3 AND k.end_date >= $2`, [ids, start, end]),
      ])
    : [[], []];

  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const col = (d: string) => Math.max(1, Math.min(days + 1, nightsBetween(start, d) + 1));
  const link = (s: string, v: View = view) =>
    `${basePath}?` + new URLSearchParams({ view: v, start: s, ...(v === "range" ? { days: String(days) } : {}), ...(selected ? { property: selected.id } : {}) });
  const period = view === "day" ? fmtDate(start, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : view === "month" && start.endsWith("-01") && end === nextMonth(start) ? fmtDate(start, { month: "long", year: "numeric" })
    : `${fmtShort(start)} – ${fmtDate(addDays(end, -1), { month: "short", day: "numeric", year: "numeric" })}`;
  const unit = view === "day" ? "day" : view === "week" ? "week" : view === "month" ? "month" : "";
  // On the board, bars only include stays that touch a night in view (not ones that just left on day one).
  const barRes = res.filter(b => b.check_out > start), barBlocks = blocks.filter(b => b.end_date > start);
  const arrivalsToday = res.filter(r => r.check_in === today).length, departuresToday = res.filter(r => r.check_out === today).length;
  const inHouse = res.filter(r => r.check_in <= today && r.check_out > today && r.status === "confirmed").length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row mc-controls">
        <div className="seg" role="group" aria-label="Calendar view">
          {VIEWS.map(([v, label]) => (
            <Link key={v} className={`btn btn-sm ${view === v ? "btn-primary" : "btn-ghost"}`} aria-current={view === v ? "page" : undefined}
              href={link(v === "day" ? (start <= today && today < end ? today : start) : start, v)}>{label}</Link>
          ))}
        </div>
        <Link className="btn btn-ghost btn-sm" href={link(prev)} aria-label={unit ? `Previous ${unit}` : "Earlier"}>‹<span className="nav-txt">{unit ? ` Previous ${unit}` : " Earlier"}</span></Link>
        <Link className="btn btn-ghost btn-sm" href={link(todayStart)}>Today</Link>
        <Link className="btn btn-ghost btn-sm" href={link(next)} aria-label={unit ? `Next ${unit}` : "Later"}><span className="nav-txt">{unit ? `Next ${unit} ` : "Later "}</span>›</Link>
      </div>
      <form className="row mc-controls" method="get" action={basePath}>
        <input type="hidden" name="view" value={view} />
        {view === "range" && <input type="hidden" name="days" value={String(days)} />}
        <input className="input mc-date" type="date" name="start" defaultValue={start} style={{ width: "auto" }} aria-label="Go to date" />
        <select className="input mc-propsel" name="property" defaultValue={selected?.id || ""} style={{ width: "auto", minWidth: 0, maxWidth: "100%" }} aria-label="Property">
          <option value="">All properties</option>
          {ordered.map(p => <option key={p.id} value={p.id}>{p.parent_id ? "   ↳ " : ""}{p.title}</option>)}
        </select>
        <button className="btn btn-ghost">Show</button>
      </form>
      <nav className="mc-rail" aria-label="Pick a listing by photo">
        <Link href={`${basePath}?` + new URLSearchParams({ view, start })} className={`mc-rail-all${selected ? "" : " on"}`} title="All properties">All</Link>
        {ordered.map(p => (
          <Link key={p.id} href={`${basePath}?` + new URLSearchParams({ view, start, property: p.id })} className={selected?.id === p.id ? "on" : ""} title={p.title} aria-label={p.title}>
            <Thumb p={p} />
          </Link>
        ))}
      </nav>
      <h2 className="mc-period">{period}{selected ? <span className="muted"> · {selected.title}</span> : null}</h2>

      {rows.length === 0 ? <div className="empty"><p className="muted">No listings yet.</p></div> : selected && view === "month" ? (
        <MonthGrid p={selected} res={res} blocks={blocks} start={start} end={end} today={today} />
      ) : view === "month" ? (
        <AllMonthGrid rows={rows} res={res} blocks={blocks} start={start} end={end} today={today} dayHref={d => link(d, "day")} />
      ) : (
        <div className="mc-wrap">
          <div className={`mc mc-v-${view}`} style={{ gridTemplateColumns: view === "day" ? "minmax(150px, 55%) minmax(110px, 1fr)" : `var(--mc-name-w) repeat(${days}, minmax(${view === "week" ? 34 : days > 30 ? 26 : 30}px, 1fr))` }}>
            <div className="mc-corner"><span className="nav-txt">Property</span></div>
            {dates.map(d => {
              const dt = dayLabel(d), dow = dt.getUTCDay();
              return (
                <div key={d} className={`mc-day${dow === 0 || dow === 6 ? " we" : ""}${d === today ? " today" : ""}`}>
                  {view === "week" ? <small>{dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</small> : dt.getUTCDate() === 1 || d === start ? <small>{dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</small> : <small>{"SMTWTFS"[dow]}</small>}
                  <b>{dt.getUTCDate()}</b>
                </div>
              );
            })}
            {rows.map((p, ri) => {
              const r = ri + 2;
              return [
                <div key={p.id + "n"} className={`mc-name mc-name-ph${p.parent_id ? " room" : ""}`} style={{ gridRow: r }}>
                  <Link href={`${basePath}?` + new URLSearchParams({ view: "month", start, property: p.id })} title={`${p.title} – open its month calendar`} className="mc-ph"><Thumb p={p} /></Link>
                  <div className="mc-name-txt">
                    <Link href={`/host/listings/${p.id}/calendar`} title="Block dates on this listing">{p.parent_id ? "↳ " : ""}{p.title}</Link>
                    <span className="hint">{p.city}{p.status !== "published" ? ` · ${p.status}` : ""}</span>
                  </div>
                </div>,
                ...dates.map((d, ci) => {
                  const dow = dayLabel(d).getUTCDay();
                  return <div key={p.id + d} className={`mc-cell${dow === 0 || dow === 6 ? " we" : ""}${d === today ? " today" : ""}`} style={{ gridRow: r, gridColumn: ci + 2 }} />;
                }),
                ...barBlocks.filter(b => b.property_id === p.id).map(b => {
                  const ch = b.source.startsWith("ical") ? channelOf(b.feed_name || b.note.split(":")[0]) : null;
                  return (
                    <div key={b.id} className={`mc-bar ${ch ? `ch-${ch.key}` : "blk"}${b.start_date < start ? " cut-l" : ""}${b.end_date > end ? " cut-r" : ""}`} style={{ gridRow: r, gridColumn: `${col(b.start_date) + 1} / ${col(b.end_date) + 1}` }}
                      title={`${ch ? `Booked on ${ch.label}` : b.note || "Blocked"}: ${b.start_date} → ${b.end_date}${ch && b.note.includes(":") ? ` · ${b.note.split(":").slice(1).join(":").trim()}` : ""}`}>
                      <span>{view === "day" && ch ? `${b.start_date === start ? "Arriving" : "Staying"}: ${ch.label}` : ch ? ch.label : b.note || "Blocked"}</span>
                    </div>
                  );
                }),
                ...res.filter(b => b.property_id === p.id && barRes.includes(b)).map(b => (
                  <Link key={b.id} href={`/trips/${b.code}`} className={`mc-bar ${b.status === "confirmed" ? "ok" : "warn"}${b.check_in < start ? " cut-l" : ""}${b.check_out > end ? " cut-r" : ""}`}
                    style={{ gridRow: r, gridColumn: `${col(b.check_in) + 1} / ${col(b.check_out) + 1}` }}
                    title={`Sevgio Stays · ${b.code} · ${b.guest_name} · ${b.check_in} → ${b.check_out} · ${b.nights} night${b.nights === 1 ? "" : "s"} · ${b.guests} guests${b.status === "pending" ? " · awaiting approval" : b.status === "awaiting_payment" ? " · awaiting payment" : ""}`}>
                    <span>{view === "day" ? `${b.check_in === start ? "Arriving" : "Staying"}: ${b.guest_name}` : b.guest_name}</span>
                  </Link>
                )),
                // On the day view, guests checking out that morning are listed too.
                ...(view === "day" ? res.filter(b => b.property_id === p.id && b.check_out === start).map(b => (
                  <Link key={b.id + "out"} href={`/trips/${b.code}`} className="mc-leave" style={{ gridRow: r, gridColumn: 2 }}>Leaving: {b.guest_name}</Link>
                )) : []),
              ];
            })}
          </div>
        </div>
      )}
      <div className="row" style={{ gap: 20 }}>
        <span><b>{arrivalsToday}</b> <span className="muted">arriving today</span></span>
        <span><b>{departuresToday}</b> <span className="muted">leaving today</span></span>
        <span><b>{inHouse}</b> <span className="muted">stays in progress</span></span>
        <span className="spacer" />
        <span className="legend" style={{ margin: 0 }}>
          <span><i className="mc-key ok" />Sevgio Stays</span>
          <span><i className="mc-key ch-airbnb" />Airbnb</span>
          <span><i className="mc-key ch-bookingcom" />Booking.com</span>
          <span><i className="mc-key ch-vrbo" />Vrbo</span>
          <span><i className="mc-key ch-furnished" />Furnished Finder</span>
          <span><i className="mc-key warn" />Awaiting approval / payment</span>
          <span><i className="mc-key blk" />Blocked by you</span>
        </span>
      </div>
      <p className="hint">{view === "day" ? "Tap a guest to open the reservation, or a property name to block dates." : <>Bars run from check-in day to check-out day. Click a reservation to open it, or a property name to block dates. Tap a photo to see that property's month with prices. Rooms are listed under their house; booking the house blocks its rooms. On a phone, swipe the board sideways to see more days.</>}</p>
    </div>
  );
}

function Thumb({ p }: { p: Prop }) {
  return p.cover_id
    ? <img src={`/api/photos/${p.cover_id}?s=thumb`} alt="" loading="lazy" width={48} height={48} />
    : <span className="mc-noph" aria-hidden>{p.title.slice(0, 1)}</span>;
}

const money = (c: number) => "$" + (c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });

/** One property's month, laid out like a wall calendar: each day shows its price, or who is staying. */
function MonthGrid({ p, res, blocks, start, end, today }: { p: Prop; res: Res[]; blocks: Blk[]; start: string; end: string; today: string }) {
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
        const first = s && (s.from === d || d === start || dayLabel(d).getUTCDay() === 0);
        const inner = s ? (
          <span className={`mg-bar ${s.cls}${s.from === d ? " s" : ""}${addDays(d, 1) === s.to ? " e" : ""}`} title={s.title}>{first ? s.label : "\u00a0"}</span>
        ) : <span className="mg-price">{money(p.nightly_price_cents)}</span>;
        return (
          <div key={d} role="gridcell" className={`mg-day${d < today ? " past" : ""}${s ? " booked" : ""}`}>
            <span className={`mg-num${d === today ? " today" : ""}`}>{Number(d.slice(8))}</span>
            {s?.href ? <Link href={s.href} className="mg-link">{inner}</Link> : inner}
          </div>
        );
      })}
    </div>
  );
}

/** Every property's month on one wall calendar: each night lists the listings that are booked or blocked. Tap a day for details. */
function AllMonthGrid({ rows, res, blocks, start, end, today, dayHref }: { rows: Prop[]; res: Res[]; blocks: Blk[]; start: string; end: string; today: string; dayHref: (d: string) => string }) {
  const name = new Map(rows.map(r => [r.id, r.title]));
  type Tag = { key: string; from: string; to: string; cls: string; text: string; title: string };
  const tags: Tag[] = [
    ...res.filter(b => name.has(b.property_id)).map(b => ({ key: b.id, from: b.check_in, to: b.check_out, cls: b.status === "confirmed" ? "ok" : "warn",
      text: name.get(b.property_id)!, title: `${name.get(b.property_id)} · ${b.guest_name} · ${b.check_in} → ${b.check_out}` })),
    ...blocks.filter(b => name.has(b.property_id)).map(b => {
      const ch = b.source.startsWith("ical") ? channelOf(b.feed_name || b.note.split(":")[0]) : null;
      return { key: b.id, from: b.start_date, to: b.end_date, cls: ch ? `ch-${ch.key}` : "blk", text: name.get(b.property_id)!,
        title: `${name.get(b.property_id)} · ${ch ? `Booked on ${ch.label}` : b.note || "Blocked"} · ${b.start_date} → ${b.end_date}` };
    }),
  ].sort((a, b) => a.text.localeCompare(b.text));
  const lead = dayLabel(start).getUTCDay();
  const dates: string[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) dates.push(d);
  return (
    <div className="mg mg-all" role="grid" aria-label="All properties month calendar">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(w => <div key={w} className="mg-dow" role="columnheader">{w}</div>)}
      {Array.from({ length: lead }, (_, i) => <div key={"x" + i} className="mg-blank" />)}
      {dates.map(d => {
        const on = tags.filter(t => t.from <= d && d < t.to);
        const shown = on.slice(0, 4);
        return (
          <Link key={d} href={dayHref(d)} role="gridcell" className={`mg-day mg-link-day${d < today ? " past" : ""}`} aria-label={`${fmtDate(d)}: ${on.length ? `${on.length} booked` : "all free"}`}>
            <span className={`mg-num${d === today ? " today" : ""}`}>{Number(d.slice(8))}</span>
            <span className="mg-tags">
              {shown.map(t => <span key={t.key} className={`mg-tag ${t.cls}`} title={t.title}>{t.text}</span>)}
              {on.length > shown.length && <span className="mg-more">+{on.length - shown.length} more</span>}
            </span>
            {on.length > 0 && <span className="mg-count">{on.length} booked</span>}
          </Link>
        );
      })}
    </div>
  );
}

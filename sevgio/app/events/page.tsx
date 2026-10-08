import type { Metadata } from "next";
import Link from "next/link";
import { Thumb } from "@/components/Thumb.tsx";
import type { ThumbName } from "@/lib/thumbs.ts";
import { CATEGORIES, TEAMS, eventsBetween, timeLabel, type Ev } from "@/lib/events.ts";
import { addDays, fmtDate, fmtShort, isIsoDate, nightsBetween, todayLocal } from "@/lib/dates.ts";
import { getT } from "@/lib/i18n.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  alternates: { canonical: "/events" },
  title: "Pittsburgh events: games, concerts and festivals",
  description: "What's on in Pittsburgh today, this week and this month: Steelers, Pirates and Penguins games, concerts, shows and festivals.",
};

const VIEWS = [["day", "Day"], ["week", "Week"], ["month", "Month"]] as const;
type View = (typeof VIEWS)[number][0];
// A photo for each team and category: on the filter pills, and on event cards that have no picture of their own.
const PHOTO: Record<string, ThumbName> = { steelers: "steelers", pirates: "pirates", penguins: "penguins", Sports: "sports", Music: "music", "Arts & Theatre": "theatre", Family: "family", Festivals: "festivals", "Food & Drink": "food-drink", Other: "events" };
const TONE: Record<string, string> = { steelers: "#101820", pirates: "#27251F", penguins: "#FCB514", Sports: "#0B2A5B", Music: "#7A3E9D", "Arts & Theatre": "#B3262B", Family: "#0A6B66", Festivals: "#C47A00", "Food & Drink": "#8A4B12", Other: "#29353F" };
const OFFICIAL = [
  { icon: "steelers", name: "Steelers schedule", text: "Home games at Acrisure Stadium, North Shore.", url: "https://www.steelers.com/schedule/" },
  { icon: "pirates", name: "Pirates schedule", text: "Home games at PNC Park, North Shore.", url: "https://www.mlb.com/pirates/schedule" },
  { icon: "penguins", name: "Penguins schedule", text: "Home games at PPG Paints Arena, Uptown.", url: "https://www.nhl.com/penguins/schedule" },
  { icon: "skyline-night", name: "Downtown Pittsburgh events", text: "Festivals, markets and happenings downtown.", url: "https://downtownpittsburgh.com/events/" },
  { icon: "concert-crowd", name: "Concerts & shows on Ticketmaster", text: "Music, comedy and theatre around Pittsburgh.", url: "https://www.ticketmaster.com/discover/pittsburgh" },
  { icon: "skyline-incline", name: "VisitPittsburgh events", text: "The city's official visitor calendar.", url: "https://www.visitpittsburgh.com/events-festivals/" },
] satisfies { icon: ThumbName; name: string; text: string; url: string }[];
const monthStart = (d: string) => d.slice(0, 8) + "01";
const nextMonth = (d: string) => addDays(monthStart(d), 32).slice(0, 8) + "01";
const prevMonth = (d: string) => addDays(monthStart(d), -1).slice(0, 8) + "01";
const ord = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

export default async function Events({ searchParams }: { searchParams: Promise<{ view?: string; start?: string; show?: string }> }) {
  const sp = await searchParams;
  const { t } = await getT();
  const today = todayLocal();
  const view: View = sp.view === "day" || sp.view === "month" ? sp.view : "week";
  const anchor = isIsoDate(sp.start) ? sp.start! : today;
  const show = sp.show || "";
  let from: string, to: string, prev: string, next: string;
  if (view === "day") { from = anchor; to = addDays(from, 1); prev = addDays(from, -1); next = to; }
  else if (view === "week") { from = anchor; to = addDays(from, 7); prev = addDays(from, -7); next = to; }
  else { const m = monthStart(anchor); from = m <= today && today < nextMonth(m) ? today : m; to = nextMonth(m); prev = prevMonth(m); next = to; }
  const team = TEAMS.find(x => x.key === show)?.key;
  const category = CATEGORIES.includes(show) ? show : "";
  const events = await eventsBetween(from, to, { team, category });
  const link = (o: { view?: View; start?: string; show?: string }) => "/events?" + new URLSearchParams({ view: o.view ?? view, start: o.start ?? (view === "month" ? monthStart(from) : from), ...((o.show ?? show) ? { show: o.show ?? show } : {}) });

  // Group by the day each event (first) appears in this range.
  const groups = new Map<string, Ev[]>();
  for (const e of events) { const d = e.local_date < from ? from : e.local_date; groups.set(d, [...(groups.get(d) ?? []), e]); }
  const period = view === "day" ? fmtDate(from, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : view === "month" ? fmtDate(monthStart(from), { month: "long", year: "numeric" })
    : `${fmtShort(from)} - ${fmtDate(addDays(to, -1), { month: "short", day: "numeric", year: "numeric" })}`;
  const unit = view === "day" ? "day" : view;

  return (
    <div className="wrap events theme-light" style={{ paddingBottom: 56 }}>
      <section className="guide-hero">
        <p className="eyebrow">What's on, yinz?</p>
        <h1>{t("nav.events")}: Pittsburgh this {view === "day" ? "day" : view}</h1>
        <p className="lede">Steelers, Pirates and Penguins games, concerts, shows and festivals around the city. Tap an event for details and tickets.</p>
      </section>

      <div className="row mc-controls" style={{ marginTop: 8 }}>
        <div className="seg" role="group" aria-label="Show events by">
          {VIEWS.map(([v, label]) => <Link key={v} className={`btn btn-sm ${view === v ? "btn-primary" : "btn-ghost"}`} aria-current={view === v ? "page" : undefined} href={link({ view: v, start: v === "month" ? monthStart(from) : from })}>{label}</Link>)}
        </div>
        <Link className="btn btn-ghost btn-sm" href={link({ start: prev })} aria-label={`Previous ${unit}`}>‹<span className="nav-txt"> Previous {unit}</span></Link>
        <Link className="btn btn-ghost btn-sm" href={link({ start: view === "month" ? monthStart(today) : today })}>Today</Link>
        <Link className="btn btn-ghost btn-sm" href={link({ start: next })} aria-label={`Next ${unit}`}><span className="nav-txt">Next {unit} </span>›</Link>
      </div>
      <nav className="guide-toc" aria-label="Filter events" style={{ marginTop: 12 }}>
        <Link href={link({ show: "" }).replace(/&show=[^&]*/, "")} className={!show ? "on" : undefined}><Thumb name="events" size={30} />All events</Link>
        {TEAMS.map(x => <Link key={x.key} href={link({ show: x.key })} className={show === x.key ? "on" : undefined}><Thumb name={PHOTO[x.key] ?? "events"} size={30} />{x.name}</Link>)}
        {CATEGORIES.filter(c => c !== "Other").map(c => <Link key={c} href={link({ show: c })} className={show === c ? "on" : undefined}><Thumb name={PHOTO[c] ?? "events"} size={30} />{c}</Link>)}
      </nav>
      <h2 className="mc-period" style={{ marginTop: 18 }}>{period}</h2>

      {groups.size === 0 ? (
        <div className="empty" style={{ marginTop: 16 }}><h3>No events listed for this {unit} yet</h3><p className="muted">Try another {unit}, or check the official schedules below.</p></div>
      ) : [...groups.entries()].map(([day, list]) => (
        <section key={day} className="block" style={{ paddingTop: 18 }}>
          {view !== "day" && <h3 className="events-day">{fmtDate(day, { weekday: "long", month: "long", day: "numeric" })}{day === today ? " · Today" : ""}</h3>}
          <div className="events-grid">{list.map(e => <EventCard key={e.id + day} e={e} />)}</div>
        </section>
      ))}
      <section className="block" style={{ paddingTop: 28 }}>
        <h2>Official schedules & calendars</h2>
        <div className="guide-grid">
          {OFFICIAL.map(o => (
            <a key={o.url} className="guide-card official" href={o.url} target="_blank" rel="noopener noreferrer">
              <div className="guide-body"><Thumb name={o.icon} size={56} className="official-icon" /><h3>{o.name}</h3><p className="muted">{o.text}</p><span className="guide-map">Open ↗</span></div>
            </a>
          ))}
        </div>
      </section>
      <p className="hint" style={{ marginTop: 24 }}>Event times and details can change. Always check with the venue or ticket seller before you go. Sports and concert listings are provided by Ticketmaster.</p>
    </div>
  );
}

function EventCard({ e }: { e: Ev }) {
  const d = new Date(e.local_date + "T12:00:00Z");
  const img = e.photo_id ? `/api/site-photos/${e.photo_id}` : e.image_url;
  const key = e.team ?? e.category;
  const multi = e.end_date && e.end_date > e.local_date ? nightsBetween(e.local_date, e.end_date) + 1 : 0;
  const body = (
    <>
      <div className="event-pic" style={{ "--tone": TONE[key] ?? TONE.Other } as React.CSSProperties}>
        {img ? <img src={img} alt={e.title} loading="lazy" referrerPolicy="no-referrer" /> : <Thumb name={PHOTO[key] ?? PHOTO.Other} size={96} className="event-thumb" />}
        <span className="event-date" aria-label={fmtDate(e.local_date)}>
          <small>{d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()}</small>
          <b>{d.getUTCDate()}<sup>{ord(d.getUTCDate())}</sup></b>
          {e.local_time && <small>{timeLabel(e.local_time)}</small>}
        </span>
        {multi > 0 && <span className="event-dates"><b>See all dates</b><small>{fmtShort(e.local_date)} - {fmtShort(e.end_date!)} ({multi} days)</small></span>}
        <span className="event-tags">
          {e.featured && <span>Featured</span>}
          {e.free && <span>Free</span>}
          {e.team && <span>{TEAMS.find(x => x.key === e.team)?.name}</span>}
        </span>
      </div>
      <div className="event-body">
        <h3>{e.title}</h3>
        <p className="muted">{e.venue || e.category}</p>
      </div>
    </>
  );
  return e.url
    ? <a className="event-card" href={e.url} target="_blank" rel="noopener noreferrer">{body}</a>
    : <article className="event-card">{body}</article>;
}

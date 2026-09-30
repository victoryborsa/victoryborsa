import Link from "next/link";
import type { User } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { addDays, isIsoDate, nightsBetween, todayLocal } from "@/lib/dates.ts";

type Prop = { id: string; title: string; city: string; parent_id: string | null; status: string };
type Res = { id: string; code: string; property_id: string; check_in: string; check_out: string; status: string; guest_name: string; guests: number; nights: number };
type Blk = { id: string; property_id: string; start_date: string; end_date: string; note: string; source: string };

const LENGTHS = [14, 30, 60];
const dayLabel = (d: string) => new Date(d + "T12:00:00Z");

/** Planner board: one row per listing, one column per day, reservations as bars. */
export async function MultiCalendar({ u, basePath, sp }: { u: User; basePath: string; sp: { start?: string; days?: string; property?: string } }) {
  const today = todayLocal();
  const days = LENGTHS.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const start = isIsoDate(sp.start) ? sp.start! : addDays(today, -2);
  const end = addDays(start, days);

  const all = await (u.role === "admin"
    ? q<Prop>("SELECT id, title, city, parent_id, status FROM properties")
    : q<Prop>("SELECT id, title, city, parent_id, status FROM properties WHERE host_id = $1", [u.id]));
  // Whole homes sorted by name, each followed by its rooms.
  const homes = all.filter(p => !p.parent_id || !all.some(h => h.id === p.parent_id)).sort((a, b) => a.title.localeCompare(b.title));
  const ordered = homes.flatMap(h => [h, ...all.filter(r => r.parent_id === h.id).sort((a, b) => a.title.localeCompare(b.title))]);
  const selected = ordered.find(p => p.id === sp.property);
  // Choosing a whole home also shows its rooms (their calendars are linked).
  const rows = selected ? ordered.filter(p => p.id === selected.id || p.parent_id === selected.id) : ordered;
  const ids = rows.map(r => r.id);

  const [res, blocks] = ids.length
    ? await Promise.all([
        q<Res>(`SELECT id, code, property_id, check_in, check_out, status, guest_name, guests, nights FROM bookings
                WHERE property_id = ANY($1) AND status IN ('pending','confirmed') AND check_in < $3 AND check_out > $2`, [ids, start, end]),
        q<Blk>(`SELECT id, property_id, start_date, end_date, note, source FROM blocks WHERE property_id = ANY($1) AND start_date < $3 AND end_date > $2`, [ids, start, end]),
      ])
    : [[], []];

  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const col = (d: string) => Math.max(1, Math.min(days + 1, nightsBetween(start, d) + 1));
  const link = (s: string, extra: Record<string, string> = {}) =>
    `${basePath}?` + new URLSearchParams({ start: s, days: String(days), ...(selected ? { property: selected.id } : {}), ...extra });
  const arrivalsToday = res.filter(r => r.check_in === today).length, departuresToday = res.filter(r => r.check_out === today).length;
  const inHouse = res.filter(r => r.check_in <= today && r.check_out > today && r.status === "confirmed").length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <form className="row" method="get" action={basePath}>
        <Link className="btn btn-ghost btn-sm" href={link(addDays(start, -days))} aria-label="Earlier">‹ Earlier</Link>
        <Link className="btn btn-ghost btn-sm" href={link(addDays(today, -2))}>Today</Link>
        <Link className="btn btn-ghost btn-sm" href={link(addDays(start, days))} aria-label="Later">Later ›</Link>
        <input className="input" type="date" name="start" defaultValue={start} style={{ width: "auto" }} aria-label="Start date" />
        <select className="input" name="days" defaultValue={String(days)} style={{ width: "auto" }} aria-label="How many days">
          <option value="14">2 weeks</option><option value="30">1 month</option><option value="60">2 months</option>
        </select>
        <select className="input" name="property" defaultValue={selected?.id || ""} style={{ width: "auto", minWidth: 220 }} aria-label="Property">
          <option value="">All properties</option>
          {ordered.map(p => <option key={p.id} value={p.id}>{p.parent_id ? "   ↳ " : ""}{p.title}</option>)}
        </select>
        <button className="btn btn-ghost">Show</button>
      </form>

      <div className="row" style={{ gap: 20 }}>
        <span><b>{arrivalsToday}</b> <span className="muted">arriving today</span></span>
        <span><b>{departuresToday}</b> <span className="muted">leaving today</span></span>
        <span><b>{inHouse}</b> <span className="muted">stays in progress</span></span>
        <span className="spacer" />
        <span className="legend" style={{ margin: 0 }}>
          <span><i className="mc-key ok" />Confirmed</span>
          <span><i className="mc-key warn" />Awaiting approval</span>
          <span><i className="mc-key blk" />Blocked / other site</span>
        </span>
      </div>

      {rows.length === 0 ? <div className="empty"><p className="muted">No listings yet.</p></div> : (
        <div className="mc-wrap">
          <div className="mc" style={{ gridTemplateColumns: `minmax(170px, 220px) repeat(${days}, minmax(${days > 30 ? 26 : 34}px, 1fr))` }}>
            <div className="mc-corner">Property</div>
            {dates.map(d => {
              const dt = dayLabel(d), dow = dt.getUTCDay();
              return (
                <div key={d} className={`mc-day${dow === 0 || dow === 6 ? " we" : ""}${d === today ? " today" : ""}`}>
                  {dt.getUTCDate() === 1 || d === start ? <small>{dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</small> : <small>{"SMTWTFS"[dow]}</small>}
                  <b>{dt.getUTCDate()}</b>
                </div>
              );
            })}
            {rows.map((p, ri) => {
              const r = ri + 2;
              return [
                <div key={p.id + "n"} className={`mc-name${p.parent_id ? " room" : ""}`} style={{ gridRow: r }}>
                  <Link href={`/host/listings/${p.id}/calendar`} title="Open this listing's calendar">{p.parent_id ? "↳ " : ""}{p.title}</Link>
                  <span className="hint">{p.city}{p.status !== "published" ? ` · ${p.status}` : ""}</span>
                </div>,
                ...dates.map((d, ci) => {
                  const dow = dayLabel(d).getUTCDay();
                  return <div key={p.id + d} className={`mc-cell${dow === 0 || dow === 6 ? " we" : ""}${d === today ? " today" : ""}`} style={{ gridRow: r, gridColumn: ci + 2 }} />;
                }),
                ...blocks.filter(b => b.property_id === p.id).map(b => (
                  <div key={b.id} className="mc-bar blk" style={{ gridRow: r, gridColumn: `${col(b.start_date) + 1} / ${col(b.end_date) + 1}` }} title={`${b.note || "Blocked"}: ${b.start_date} → ${b.end_date}`}>
                    <span>{b.source.startsWith("ical") ? b.note.split(":")[0] : b.note || "Blocked"}</span>
                  </div>
                )),
                ...res.filter(b => b.property_id === p.id).map(b => (
                  <Link key={b.id} href={`/trips/${b.code}`} className={`mc-bar ${b.status === "confirmed" ? "ok" : "warn"}${b.check_in < start ? " cut-l" : ""}${b.check_out > end ? " cut-r" : ""}`}
                    style={{ gridRow: r, gridColumn: `${col(b.check_in) + 1} / ${col(b.check_out) + 1}` }}
                    title={`${b.code} · ${b.guest_name} · ${b.check_in} → ${b.check_out} · ${b.nights} nights · ${b.guests} guests${b.status === "pending" ? " · awaiting approval" : ""}`}>
                    <span>{b.guest_name}</span>
                  </Link>
                )),
              ];
            })}
          </div>
        </div>
      )}
      <p className="hint">Bars run from check-in day to check-out day. Click a reservation to open it, or a property name to block dates. Rooms are listed under their house; booking the house blocks its rooms.</p>
    </div>
  );
}

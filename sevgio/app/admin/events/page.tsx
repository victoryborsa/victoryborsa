import Link from "next/link";
import { requireUser } from "@/lib/auth.ts";
import { one, q } from "@/lib/db.ts";
import { addDays, fmtDate, todayLocal } from "@/lib/dates.ts";
import { DateRangePicker } from "@/components/DatePicker.tsx";
import { CATEGORIES, eventsBetween, timeLabel } from "@/lib/events.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { addEventAction, addEventFeedAction, eventCommandAction, removeEventFeedAction, syncEventsAction } from "@/app/actions/events.ts";

export default async function AdminEvents() {
  await requireUser(["admin"], "/admin/events");
  const today = todayLocal();
  const [events, feeds, last, counts] = await Promise.all([
    eventsBetween(today, addDays(today, 60), { includeHidden: true }),
    q<{ id: string; name: string; url: string; category: string; last_synced_at: string | null; last_error: string | null; n: number }>(
      "SELECT f.*, (SELECT count(*)::int FROM events e WHERE e.feed_id = f.id) AS n FROM event_feeds f ORDER BY f.name"),
    one<{ value: unknown }>("SELECT value FROM settings WHERE key = 'events_synced_at'"),
    one<{ tm: number }>("SELECT count(*)::int AS tm FROM events WHERE source = 'ticketmaster' AND local_date >= $1", [today]),
  ]);
  const tmReady = !!(process.env.TICKETMASTER_API_KEY || "").trim();
  return (
    <div className="stack" style={{ gap: 28 }}>
      <section className="box">
        <h2>Events page</h2>
        <p className="muted">The <Link href="/events">Events page</Link> shows Steelers, Pirates and Penguins home games, concerts and shows from Ticketmaster, your calendar links and events you add here. It refreshes every 3 hours.</p>
        {tmReady
          ? <div className="notice ok">Ticketmaster is connected: {counts?.tm ?? 0} upcoming events.{last ? ` Last update ${new Date(Number(last.value)).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET.` : ""}</div>
          : <div className="notice warn"><b>Ticketmaster isn't connected yet.</b> Get a free key at developer.ticketmaster.com (My Apps → Consumer Key), then add it in Render → sevgio → Environment as <code>TICKETMASTER_API_KEY</code>.</div>}
        <ActionForm action={syncEventsAction} className="row"><SubmitButton className="btn btn-ghost btn-sm" pendingText="Updating…">Update events now</SubmitButton></ActionForm>
      </section>

      <ActionForm action={addEventAction} className="box" resetOnOk>
        <h2>Add an event</h2>
        <p className="muted">For festivals, markets and local events, e.g. from downtownpittsburgh.com. Upload the event's flyer or picture.</p>
        <label className="field"><span>Event name</span><input className="input" name="title" placeholder="Prostburgh! Oktoberfest 2026" /></label>
        <DateRangePicker id="ev-dates" today={today} min={today} minNights={0} maxMonths={24} endOptional names={["date", "end_date"]} labels={["Date (first day)", "Last day"]}
          hint="Pick the last day too for events over several days, or press Done for a one-day event." />
        <div className="grid-2">
          <label className="field"><span>Start time (optional)</span><input className="input" type="time" name="time" /></label>
          <label className="field"><span>Place</span><input className="input" name="venue" placeholder="Market Square" /></label>
          <label className="field"><span>Type of event</span><select className="input" name="category" defaultValue="Festivals">{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="field"><span>Link for details or tickets (optional)</span><input className="input" name="url" placeholder="https://…" /></label>
          <label className="field"><span>Picture (optional)</span><input className="input" type="file" name="photo" accept="image/*" /></label>
          <label className="field"><span>…or a picture link (optional)</span><input className="input" name="image_url" placeholder="https://…" /></label>
        </div>
        <div className="row"><label className="chk"><input type="checkbox" name="featured" />Featured</label><label className="chk"><input type="checkbox" name="free" />Free</label></div>
        <div><SubmitButton pendingText="Adding…">Add event</SubmitButton></div>
      </ActionForm>

      <section className="box">
        <h2>Calendar links</h2>
        <p className="muted">Paste a calendar link (.ics or webcal://) from a team, venue or events site, e.g. a team's "Add schedule to calendar" link. Its events show on the Events page and stay up to date.</p>
        {feeds.length > 0 && (
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 8 }}>
            {feeds.map(f => (
              <li key={f.id} className="row">
                <b>{f.name}</b><span className="pill neutral">{f.category}</span><span className="hint">{f.n} events{f.last_error ? ` · last error: ${f.last_error}` : ""}</span>
                <form action={removeEventFeedAction}><input type="hidden" name="id" value={f.id} /><button className="linkbtn" type="submit">Remove</button></form>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={addEventFeedAction} className="stack" resetOnOk>
          <div className="grid-2">
            <label className="field"><span>Name</span><input className="input" name="name" placeholder="Pirates schedule" /></label>
            <label className="field"><span>Type of event</span><select className="input" name="category" defaultValue="Sports">{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
          </div>
          <label className="field"><span>Calendar link</span><input className="input" name="url" placeholder="https://… .ics" /></label>
          <div><SubmitButton className="btn btn-ghost" pendingText="Reading…">Add calendar link</SubmitButton></div>
        </ActionForm>
      </section>

      <section className="stack" style={{ gap: 12 }}>
        <h2>Next 60 days ({events.length})</h2>
        {events.length === 0 ? <div className="empty"><p className="muted">No events yet.</p></div> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Event</th><th>Place</th><th>From</th><th>Show</th></tr></thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id} style={e.hidden ? { opacity: 0.5 } : undefined}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(e.local_date, { month: "short", day: "numeric", weekday: "short" })}{e.local_time ? ` · ${timeLabel(e.local_time)}` : ""}</td>
                    <td><b>{e.title}</b>{e.featured && <span className="pill ok" style={{ marginLeft: 6 }}>Featured</span>}{e.free && <span className="pill neutral" style={{ marginLeft: 6 }}>Free</span>}</td>
                    <td>{e.venue}</td>
                    <td className="hint">{e.source === "manual" ? "Added by you" : e.source === "feed" ? "Calendar link" : "Ticketmaster"}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        {([["feature", e.featured ? "Unfeature" : "Feature", "btn-ghost"], ["hide", e.hidden ? "Show" : "Hide", "btn-ghost"], ...(e.source === "manual" ? [["delete", "Delete", "btn-danger"]] : [])] as const).map(([cmd, label, cls]) => (
                          <form key={cmd} action={eventCommandAction}>
                            <input type="hidden" name="id" value={e.id} /><input type="hidden" name="cmd" value={cmd} />
                            <button className={`btn btn-sm ${cls}`} type="submit">{label}</button>
                          </form>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

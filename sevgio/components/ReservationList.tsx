import { fmtDate } from "@/lib/dates.ts";
import { dayRole, groupReservations, ROLE_LABEL, type Scope, type Sort } from "@/lib/reservation-rules.ts";
import type { ResCard } from "@/lib/reservation-list.ts";
import { Icon } from "./Icon.tsx";

const range = (a: string, b: string) => `${fmtDate(a, { month: "short", day: "numeric" })} - ${fmtDate(b, { month: "short", day: "numeric", year: "numeric" })}`;

/**
 * Reservation cards like the Booking.com app: grouped by date, then by property, each room named. Tapping a card opens its
 * details; the message icon on the right opens that guest's conversation and nothing else.
 */
export function ReservationList({ cards, scope, sort, day, today, colorOf, empty }: {
  cards: ResCard[]; scope: Scope; sort: Sort; day: string; today: string; colorOf: Map<string, string>; empty: string;
}) {
  const groups = groupReservations(cards, sort, scope);
  if (!groups.length) return <div className="empty rv-empty"><p className="muted">{empty}</p></div>;
  return (
    <div className="rv" data-testid="res-list">
      {groups.map(g => {
        const n = g.homes.reduce((x, h) => x + h.items.length, 0);
        return (
          <section key={g.date || "none"} className="rv-day" aria-label={g.date ? fmtDate(g.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "Booking date not provided"}>
            <h3 className="rv-date">
              {g.date ? <>{sort === "booked" ? "Booked " : ""}{fmtDate(g.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</> : "Booking date not provided by the site"}
              {g.date === today && <span className="pill ok">Today</span>}
              {sort === "arrival" && g.date && g.date < day && scope !== "history" && <span className="hint">arrived earlier, still staying</span>}
              <span className="rv-count">{n} reservation{n === 1 ? "" : "s"}</span>
            </h3>
            {g.homes.map(h => (
              <div key={h.home} className="rv-home">
                <h4 className="rv-home-h"><Icon name="home" size={15} />{h.home}</h4>
                <ul className="rv-list">
                  {h.items.map(c => {
                    const role = scope === "today" ? dayRole(c, day) : null;
                    return (
                      <li key={c.key} className={`rv-item${c.cancelled ? " cx" : ""}`} style={{ ["--pc" as string]: colorOf.get(c.pid) }}>
                        <div className="rv-card" data-stay={c.key} role="button" tabIndex={0} data-testid="res-card"
                          aria-label={`${c.label}, ${c.place}, ${range(c.from, c.to)}. Open details`}>
                          <span className="rv-top">
                            <b className={`rv-guest${c.guest ? "" : " missing"}`}>{c.guest || (c.source === "block" ? "External Calendar Block" : c.guestMissing)}</b>
                            <span className={`rv-src ch-${c.channel}`}>{c.sourceLabel}</span>
                          </span>
                          <span className="rv-room"><Icon name={c.room ? "room" : "home"} size={15} />{c.room ? c.room : `${c.home} (whole home)`}</span>
                          <span className="rv-line"><Icon name="calendar" size={16} />{range(c.from, c.to)}{role && <span className={`rv-role ${role}`}>{ROLE_LABEL[role]}</span>}</span>
                          <span className="rv-line"><Icon name="nights" size={16} />{c.nights} night{c.nights === 1 ? "" : "s"}</span>
                          <span className={`rv-line${c.guests ? "" : " missing"}`}><Icon name="person" size={16} />{c.guests || (c.source === "block" ? "No guests (dates only)" : `Guest count not provided by ${c.sourceLabel}`)}</span>
                          <span className="rv-meta">
                            <span className={`rv-code${c.code ? "" : " missing"}`}>{c.code ? <>Conf. <b className="mono">{c.code}</b></> : c.source === "block" ? "No confirmation number" : "Confirmation number not provided"}</span>
                            <span className={`pill ${c.statusTone}`}>{c.status}</span>
                            <span className={`pill ${c.payTone}`}>{c.pay}</span>
                            {!c.editable && <span className="rv-lock" title={c.editReason}><Icon name="lock" size={13} />Read-only</span>}
                          </span>
                        </div>
                        {c.msg.kind === "sevgio" ? (
                          <a className="rv-msg" href={c.msg.href} data-testid="res-msg"
                            aria-label={`Messages with ${c.label}${c.msg.unread ? ` (${c.msg.unread} unread)` : ""}`} title="Messages">
                            <Icon name="chats" size={24} />
                            {c.msg.unread > 0 && <span className="rv-badge" aria-hidden>{c.msg.unread}</span>}
                          </a>
                        ) : (
                          <details className="rv-msg rv-msg-off" data-testid="res-msg-off">
                            <summary aria-label="Messaging unavailable for this reservation" title="Messaging unavailable"><Icon name="nochat" size={24} /></summary>
                            <p className="rv-why">{c.msg.why}</p>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

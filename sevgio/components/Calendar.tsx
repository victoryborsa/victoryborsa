"use client";
import { useState } from "react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
export const addDaysC = (s: string, n: number) => new Date(Date.parse(s + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const label = (s: string) => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

/** `price`: the nightly rate to print inside the day's box (e.g. "$110"). */
export type DayState = { disabled: boolean; className: string; note?: string; price?: string; priceTone?: "up" | "down" | "set" };

const shift = (m: string, n: number) => { let [y, mo] = m.split("-").map(Number); mo += n; while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; } return `${y}-${pad(mo)}`; };

/** Two-month calendar. The parent decides how each day looks and what a click does.
 *  The first month's title is a month and a year list, so far-off dates are two taps away.
 *  `min`: the earliest month you can go back to (default: this month; "" for any past month, e.g. reports).
 *  `boxed`: each day gets its own bordered box, with room for its nightly rate (the pricing calendars). */
export function Calendar({ today, startMonth, dayState, onPick, onHover, min, maxMonthsAhead = 18, boxed = false }: {
  today: string; startMonth?: string; dayState: (d: string) => DayState; onPick: (d: string) => void; onHover?: (d: string) => void; min?: string; maxMonthsAhead?: number; boxed?: boolean;
}) {
  const minMonth = min === "" ? shift(today.slice(0, 7), -12 * 10) : (min || today).slice(0, 7);
  const maxMonth = shift(today.slice(0, 7), maxMonthsAhead - 1);
  const clamp = (m: string) => (m < minMonth ? minMonth : m >= maxMonth ? shift(maxMonth, -1) : m);
  const [month, setMonth] = useState(clamp((startMonth || today).slice(0, 7)));
  const months = [month, shift(month, 1)];
  const [y0] = month.split("-").map(Number);
  const years = Array.from({ length: Number(maxMonth.slice(0, 4)) - Number(minMonth.slice(0, 4)) + 1 }, (_, i) => Number(minMonth.slice(0, 4)) + i);
  return (
    <div className={`cal-wrap${boxed ? " cal-boxed" : ""}`}>
      {months.map((m, idx) => {
        const [y, mo] = m.split("-").map(Number);
        const startDow = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7;
        const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        return (
          <div key={m}>
            <div className="cal-head">
              {idx === 0 ? <button className="cal-nav" type="button" aria-label="Previous month" disabled={month <= minMonth} onClick={() => setMonth(shift(month, -1))}>‹</button> : <span style={{ width: 36 }} />}
              {idx === 0 ? (
                <h4 className="cal-jump">
                  <select aria-label="Month" value={mo} onChange={e => setMonth(clamp(`${y}-${pad(Number(e.target.value))}`))}>
                    {MONTHS.map((n, i) => <option key={n} value={i + 1} disabled={`${y}-${pad(i + 1)}` < minMonth || `${y}-${pad(i + 1)}` >= maxMonth}>{n}</option>)}
                  </select>
                  <select aria-label="Year" value={y0} onChange={e => setMonth(clamp(`${e.target.value}-${pad(mo)}`))}>
                    {years.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </h4>
              ) : <h4>{MONTHS[mo - 1]} {y}</h4>}
              {idx === 1 ? <button className="cal-nav" type="button" aria-label="Next month" disabled={shift(month, 1) >= maxMonth} onClick={() => setMonth(shift(month, 1))}>›</button> : <span style={{ width: 36 }} />}
            </div>
            <div className="cal" role="grid" aria-label={`${MONTHS[mo - 1]} ${y}`}>
              {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(d => <span key={d} className="dow" aria-hidden="true">{d}</span>)}
              {Array.from({ length: startDow }, (_, i) => <span key={"e" + i} />)}
              {Array.from({ length: days }, (_, i) => {
                const ds = `${y}-${pad(mo)}-${pad(i + 1)}`;
                const st = dayState(ds);
                return (
                  <button key={ds} type="button" data-day={ds} className={`${st.className}${ds === today ? " today" : ""}`} aria-current={ds === today ? "date" : undefined} disabled={st.disabled} onClick={() => onPick(ds)} onMouseEnter={onHover && (() => onHover(ds))}
                    aria-label={label(ds) + (st.price ? `, ${st.price} a night` : "") + (st.note ? ", " + st.note : "")}>
                    {boxed ? <><span className="cal-n">{i + 1}</span>{st.price && <span className={`cal-p${st.priceTone ? " " + st.priceTone : ""}`} data-price={ds}>{st.price}</span>}</> : i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

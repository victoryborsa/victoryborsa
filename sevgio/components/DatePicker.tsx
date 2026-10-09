"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Calendar } from "./Calendar.tsx";
import { Icon } from "./Icon.tsx";
import { checkoutLimitNote, dayLook, isDate, pickDay, validRange, type Phase, type Range, type RangeRules } from "@/lib/date-range.ts";

/*
 * The one date picker used everywhere on the site: search, listings, booking, host and admin forms.
 * Change how picking dates works here (and in lib/date-range.ts), and every page follows.
 *
 * Tapping a date field opens the calendar. In a check-in / check-out pair, picking check-in moves
 * straight on to check-out, days before check-in and booked nights can't be picked, and the whole
 * stay is highlighted. On phones the calendar slides up from the bottom; on computers it drops down.
 */

export const showDate = (d: string, long = false) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", long
  ? { weekday: "short", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }
  : { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "");

type Rules = { min?: string; max?: string; taken?: Iterable<string>; minNights?: number; maxNights?: number };
const useRules = ({ min, max, taken, minNights, maxNights }: Rules): RangeRules => {
  const set = useMemo(() => (taken ? new Set(taken) : undefined), [taken]);
  return { min, max, taken: set, minNights, maxNights };
};

/** On computers, nudges the calendar sideways so it never runs off the edge of the window (e.g. in the booking box). */
function useFit(open: unknown, box: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const pop = box.current?.querySelector<HTMLElement>(":scope > .dr-pop");
    if (!pop) return;
    pop.style.transform = "";
    if (window.innerWidth < 900) return;
    const r = pop.getBoundingClientRect(), edge = document.documentElement.clientWidth - 16;
    const dx = r.right > edge ? Math.max(16 - r.left, edge - r.right) : 0;
    if (dx) pop.style.transform = `translateX(${dx}px)`;
  }, [open, box]);
}

/** Closes a popup on outside click or Escape. */
function useDismiss(open: boolean, box: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", h);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", h); };
  }, [open, box, close]);
}

/**
 * The calendar panel itself: a prompt line, two months and Clear / Close. Used inside the date fields below
 * and by the home page search bar, so the calendar looks and behaves the same everywhere.
 */
export function RangePanel({ phase, value, rules, today, labels, onChange, onClose, closeText = "Close", startMonth, single = false, maxMonths }: {
  phase: Phase; value: Range; rules: RangeRules; today: string; labels: [string, string]; single?: boolean; maxMonths?: number;
  onChange: (v: Range, phase: Phase | "", done: boolean) => void; onClose: () => void; closeText?: string; startMonth?: string;
}) {
  const [hover, setHover] = useState("");
  const { ci, co } = value;
  const pick = (d: string) => {
    if (single) return onChange({ ci: d, co: "" }, "", true);
    const n = pickDay(d, phase, value, rules);
    onChange({ ci: n.ci, co: n.co }, n.done ? "" : n.phase, n.done);
  };
  const look = (d: string) => single
    ? { disabled: (!!rules.min && d < rules.min) || (!!rules.max && d > rules.max), className: d === ci ? "sel" : "" }
    : dayLook(d, phase, value, rules, hover);
  const head = single ? `${labels[0]}${ci ? `: ${showDate(ci, true)}` : ""}`
    : phase === "ci" ? `${labels[0]}: choose a date` : `${labels[1]}: choose a date after ${showDate(ci)}`;
  const first = phase === "co" && ci ? ci : ci || co || "";
  const limit = !single && phase === "co" && ci ? checkoutLimitNote(ci, rules) : "";
  return (
    <>
      <p className="dr-head" aria-live="polite">{head}{!single && rules.minNights && rules.minNights > 1 && phase === "co" ? <span className="muted"> · minimum {rules.minNights} nights</span> : null}</p>
      {limit && <p className="dr-limit" role="note">{limit}</p>}
      <Calendar key={single ? "s" : phase === "co" ? `co${ci}` : "ci"} today={today} min={rules.min ?? ""} startMonth={startMonth || (first && (!rules.min || first >= rules.min) ? first : today)}
        maxMonthsAhead={maxMonths} dayState={look} onPick={pick} onHover={!single && phase === "co" ? setHover : undefined} />
      {!single && rules.taken && rules.taken.size > 0 && <div className="legend cal-legend dr-legend"><span><i className="lg-sel" />Your dates</span><span><i className="lg-taken" />Booked</span></div>}
      <div className="dr-foot">
        {(ci || co) && <button type="button" className="linkbtn" onClick={() => onChange({ ci: "", co: "" }, single ? "" : "ci", false)}>{single ? "Clear" : "Clear dates"}</button>}
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>{closeText}</button>
      </div>
    </>
  );
}

/** Lets the form's own "required" check cover a picker: an invisible box that opens the calendar when empty. */
function RequiredProxy({ value, onInvalid }: { value: string; onInvalid: () => void }) {
  return <input className="dp-req" tabIndex={-1} aria-hidden="true" required value={value} onChange={() => {}} onInvalid={e => { e.preventDefault(); onInvalid(); }} />;
}

/** Tells listeners (auto-submitting filters, "unsaved changes" checks) that the dates changed. */
const announce = (el: HTMLElement | null) => setTimeout(() => el?.querySelector("input[type=hidden]")?.dispatchEvent(new Event("change", { bubbles: true })), 0);

export type DateRangeProps = Rules & {
  /** Names of the two hidden form fields. */
  names?: [string, string];
  labels?: [string, string];
  initial?: Partial<Range>;
  /** Controlled mode (e.g. the listing page, where the calendar below the photos shares the same dates). */
  value?: Range;
  onChange?: (v: Range) => void;
  /** Runs once a full stay is picked, e.g. to move on to Guests. */
  onDone?: (v: Range) => void;
  today: string;
  required?: boolean;
  /** The end date may stay empty (e.g. one-day events). */
  endOptional?: boolean;
  placeholder?: string;
  hint?: string;
  /** How far ahead the calendar goes, in months (default 18). */
  maxMonths?: number;
  /** "search": the tall boxes of the search bars. "form": a normal form field (default). */
  variant?: "form" | "search";
  id?: string;
};

/** Check-in and check-out (or From / To), with one calendar that moves from the first date to the second by itself. */
export function DateRangePicker(props: DateRangeProps) {
  const { names = ["ci", "co"], labels = ["Check-in", "Check-out"], initial, value, onChange, onDone, today, required, endOptional, placeholder = "Add date", hint, variant = "form", maxMonths } = props;
  const rules = useRules(props);
  const [inner, setInner] = useState<Range>(() => {
    const v = { ci: initial?.ci || "", co: initial?.co || "" };
    if (validRange(v, rules)) return v;
    return { ci: isDate(v.ci) && (!rules.min || v.ci >= rules.min) ? v.ci : "", co: "" };
  });
  const cur = value ?? inner;
  const [open, setOpen] = useState<Phase | "">("");
  const box = useRef<HTMLDivElement>(null);
  const opened = useRef(cur);
  const set = (v: Range) => { if (!value) setInner(v); onChange?.(v); };
  const close = () => setOpen("");
  useDismiss(!!open, box, close);
  useFit(open, box);

  useEffect(() => {
    // Other parts of a form can open the calendar (e.g. picking "Where" in the search bar), and a form reset clears it.
    const form = box.current?.closest("form");
    const onWhere = () => setOpen("ci");
    const onReset = () => { setInner({ ci: "", co: "" }); setOpen(""); };
    form?.addEventListener("sevgio:where-picked", onWhere);
    form?.addEventListener("reset", onReset);
    return () => { form?.removeEventListener("sevgio:where-picked", onWhere); form?.removeEventListener("reset", onReset); };
  }, []);
  useEffect(() => {
    // Remember the dates when the calendar opens (not when it moves on to check-out), and announce a change when it closes.
    if (open) { opened.current = cur; return; }
    if (opened.current.ci !== cur.ci || opened.current.co !== cur.co) { opened.current = cur; announce(box.current); }
  }, [!!open]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (v: Range, phase: Phase | "", done: boolean) => {
    set(v);
    setOpen(phase);
    if (done) setTimeout(() => { onDone?.(v); box.current?.dispatchEvent(new CustomEvent("sevgio:dates-picked", { bubbles: true })); }, 0);
  };
  const field = (k: Phase, i: 0 | 1) => {
    const v = k === "ci" ? cur.ci : cur.co;
    const id = `${props.id || names[0]}-${k}`;
    const toggle = () => setOpen(open === k ? "" : k === "co" && !cur.ci ? "ci" : k);
    if (variant === "search") return (
      <button type="button" className={`field dr-field${open === k ? " on" : ""}`} aria-label={`${labels[i]}${v ? `: ${showDate(v)}` : ""}`} aria-expanded={open === k} onClick={toggle}>
        <span>{labels[i]}</span><b className={v ? "" : "dr-ph"}>{v ? showDate(v).replace(/, \d{4}$/, "") : placeholder}</b>
      </button>
    );
    return (
      <div className="field dp-field">
        <span id={`${id}-l`}>{labels[i]}{i === 1 && endOptional ? <span className="muted" style={{ fontWeight: 400 }}> (optional)</span> : null}</span>
        <button type="button" className={`input df-btn${open === k ? " on" : ""}`} aria-labelledby={`${id}-l ${id}-v`} aria-expanded={open === k} aria-haspopup="dialog" onClick={toggle}>
          <span id={`${id}-v`} className={v ? "" : "df-ph"}>{v ? showDate(v).replace(/^\w+, /, "") : placeholder}</span>
          <Icon name="calendar" size={18} />
        </button>
      </div>
    );
  };
  return (
    <div className={variant === "search" ? `dr${open ? " open" : ""}` : "dp"} ref={box}>
      {names[0] && <input type="hidden" name={names[0]} value={cur.ci} />}
      {names[1] && <input type="hidden" name={names[1]} value={cur.co} />}
      {required && <RequiredProxy value={cur.ci && (cur.co || endOptional) ? "ok" : ""} onInvalid={() => setOpen(cur.ci ? "co" : "ci")} />}
      {variant === "search" ? <>{field("ci", 0)}{field("co", 1)}</> : <div className="grid-2 dp-pair">{field("ci", 0)}{field("co", 1)}</div>}
      {hint && <span className="hint">{hint}</span>}
      {open && (
        <div className="dr-pop" role="dialog" aria-label={`Choose ${labels[open === "ci" ? 0 : 1].toLowerCase()}`}>
          <RangePanel phase={open} value={cur} rules={rules} today={today} labels={labels} onChange={change} onClose={close} closeText={open === "co" && endOptional ? "Done" : "Close"} maxMonths={maxMonths} />
        </div>
      )}
    </div>
  );
}

/** One date (move-in, payout date, flight date…), with the same calendar as everywhere else. */
export function DatePicker({ name, label, initial = "", today, min, max, required, emptyText = "Add date", hint, clearable = true, onChange, maxMonths }: {
  name: string; label: string; initial?: string; today: string; min?: string; max?: string; required?: boolean; emptyText?: string; hint?: string; clearable?: boolean; onChange?: (d: string) => void; maxMonths?: number;
}) {
  const [value, setValue] = useState(isDate(initial) ? initial : "");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = `df-${name}`;
  const close = () => setOpen(false);
  useDismiss(open, box, close);
  useFit(open, box);
  useEffect(() => {
    const form = box.current?.closest("form");
    const onReset = () => { setValue(isDate(initial) ? initial : ""); setOpen(false); };
    form?.addEventListener("reset", onReset);
    return () => form?.removeEventListener("reset", onReset);
  }, [initial]);
  const set = (d: string) => { setValue(d); onChange?.(d); announce(box.current); };
  return (
    <div className="field df" ref={box}>
      <span id={`${id}-l`}>{label}</span>
      <input type="hidden" name={name} value={value} />
      {required && <RequiredProxy value={value} onInvalid={() => setOpen(true)} />}
      <div className="df-box">
        <button type="button" className={`input df-btn${open ? " on" : ""}`} aria-labelledby={`${id}-l ${id}-v`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
          <span id={`${id}-v`} className={value ? "" : "df-ph"}>{value ? showDate(value, true) : emptyText}</span>
          <Icon name="calendar" size={18} />
        </button>
        {value && clearable && !required && <button type="button" className="df-clear" aria-label={`Clear ${label}`} onClick={() => { set(""); setOpen(false); }}>×</button>}
      </div>
      {hint && <span className="hint">{hint}</span>}
      {open && (
        <div className="dr-pop df-pop" role="dialog" aria-label={`Choose ${label.toLowerCase()}`}>
          <RangePanel single phase="ci" value={{ ci: value, co: "" }} rules={{ min, max }} today={today} labels={[label, ""]} maxMonths={maxMonths}
            startMonth={value || (min && min > today ? min : today)}
            onChange={v => { set(v.ci); if (v.ci) setOpen(false); }} onClose={close} />
        </div>
      )}
    </div>
  );
}

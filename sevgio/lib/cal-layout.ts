import { addDays, nightsBetween } from "./dates.ts";

/** Anything that occupies nights on a calendar: from the arrival day up to (not including) the departure day. */
export type Span = { from: string; to: string };

/**
 * Stacks stays into lanes so none overlap. Back-to-back stays (one leaves the day the next arrives)
 * share a lane, since they meet halfway through that day.
 */
export function assignLanes<T extends Span>(items: T[]): { placed: { item: T; lane: number }[]; lanes: number } {
  const sorted = [...items].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const laneEnds: string[] = [];
  const placed = sorted.map(item => {
    let lane = laneEnds.findIndex(end => end <= item.from);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(item.to); } else laneEnds[lane] = item.to;
    return { item, lane };
  });
  return { placed, lanes: Math.max(1, laneEnds.length) };
}

/**
 * Where a stay's bar sits on a timeline that gives each day two half-columns after one label column.
 * The bar starts halfway through the arrival day and ends halfway through the departure day,
 * so arrivals and departures are both visible. Returns grid lines (end exclusive) and whether
 * either end runs past the visible range.
 */
export function barLines(start: string, days: number, s: Span): { from: number; to: number; cutL: boolean; cutR: boolean } {
  const i = nightsBetween(start, s.from), j = nightsBetween(start, s.to);
  const cutL = i < 0, cutR = j >= days;
  return { from: cutL ? 2 : 3 + 2 * i, to: cutR ? 2 + 2 * days : 3 + 2 * j, cutL, cutR };
}

/** Whether a stay shows anywhere on the timeline: a night in view, or a departure on a visible day. */
export function inView(start: string, days: number, s: Span): boolean {
  return s.from < addDays(start, days) && s.to >= start && s.to > s.from;
}

/** Groups items by arrival day, earliest first; within a day, by the given label. */
export function groupByArrival<T extends { from: string; sortKey: string }>(items: T[]): { date: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of [...items].sort((a, b) => a.from.localeCompare(b.from) || a.sortKey.localeCompare(b.sortKey))) {
    if (!map.has(it.from)) map.set(it.from, []);
    map.get(it.from)!.push(it);
  }
  return [...map].map(([date, items]) => ({ date, items }));
}

/** One color per listing, picked by its place in the host's listing order so it stays the same everywhere. */
export const PROPERTY_COLORS = ["#5B8DEF", "#E07A5F", "#3FB8AF", "#C77DFF", "#F2C14E", "#4CC9F0", "#F28482", "#90BE6D", "#B5838D", "#43AA8B", "#F9844A", "#8D99AE"];
export const propertyColor = (index: number) => PROPERTY_COLORS[((index % PROPERTY_COLORS.length) + PROPERTY_COLORS.length) % PROPERTY_COLORS.length];

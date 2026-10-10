"use client";
import { useEffect, useState } from "react";
import type { ListingStats as Stats } from "@/lib/listing-stats.ts";

const n = (x: number) => x.toLocaleString("en-US");
const plural = (x: number, one: string, many: string) => `${n(x)} ${x === 1 ? one : many}`;

export function statsPost(id: string, body: object): Promise<Stats | null> {
  return fetch(`/api/listing-stats/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true })
    .then(r => (r.ok ? r.json() : null)).catch(() => null);
}

const Eye = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
const Heart = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.6 0 5.7 3.5 4.5 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z" /></svg>;
const Person = () => <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>;
const Share = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" /></svg>;

/** Views, favourites, interested and shares for a listing, with Save and I'm interested buttons. Counts this visit as a view. */
export function ListingStats({ id, initial, live }: { id: string; initial: Stats; live: boolean }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!live) return;
    statsPost(id, { kind: "view" }).then(r => r && setS(r));
    const onShared = (e: Event) => { const d = (e as CustomEvent<Stats>).detail; if (d) setS(d); };
    window.addEventListener("sevgio:shared", onShared);
    return () => window.removeEventListener("sevgio:shared", onShared);
  }, [id, live]);
  const toggle = async (kind: "favorite" | "interested") => {
    if (!live || busy) return;
    const on = !s.mine[kind];
    // Show the change straight away, then use the real numbers from the server.
    setS(x => ({ ...x, [kind === "favorite" ? "favorites" : "interested"]: x[kind === "favorite" ? "favorites" : "interested"] + (on ? 1 : -1), mine: { ...x.mine, [kind]: on } }));
    setBusy(true);
    const r = await statsPost(id, { kind, on });
    setBusy(false);
    if (r) setS(r);
  };
  return (
    <div className="lstats">
      {/* Counts of zero are left out, so guests never see "0 views". */}
      {(s.views > 0 || s.favorites > 0 || s.interested > 0 || s.shares > 0) && (
        <ul className="lstats-list" aria-label="Listing activity">
          {s.views > 0 && <li><Eye />{plural(s.views, "view", "views")}</li>}
          {s.favorites > 0 && <li><Heart />{plural(s.favorites, "time saved as favourite", "times saved as favourite")}</li>}
          {s.interested > 0 && <li><Person />{n(s.interested)} interested</li>}
          {s.shares > 0 && <li><Share />{plural(s.shares, "time shared", "times shared")}</li>}
        </ul>
      )}
      {live && (
        <div className="lstats-actions">
          <button type="button" className={`btn btn-ghost btn-sm lstats-btn${s.mine.favorite ? " on" : ""}`} aria-pressed={s.mine.favorite} onClick={() => toggle("favorite")}>
            <Heart />{s.mine.favorite ? "Saved" : "Save"}
          </button>
          <button type="button" className={`btn btn-ghost btn-sm lstats-btn${s.mine.interested ? " on" : ""}`} aria-pressed={s.mine.interested} onClick={() => toggle("interested")}>
            <Person />{s.mine.interested ? "Interested" : "I'm interested"}
          </button>
        </div>
      )}
    </div>
  );
}

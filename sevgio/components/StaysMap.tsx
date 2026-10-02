"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type MapPin = { id: string; lat: number; lng: number; price: string; title: string; sub: string; href: string; img: string | null };

/** Search results map: a price pin for each stay. Hovering a card lights up its pin; tapping a pin shows the stay. */
export function StaysMap({ pins }: { pins: MapPin[] }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    const onHover = (e: Event) => {
      const id = (e.target as HTMLElement).closest?.("[data-pid]")?.getAttribute("data-pid");
      el.current?.querySelectorAll<HTMLElement>(".map-pin").forEach(m => m.classList.toggle("hot", m.dataset.pin === id && e.type === "mouseover"));
    };
    const resize = () => setTimeout(() => map?.invalidateSize(), 50);
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: true, zoomControl: true, attributionControl: true });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19, subdomains: "abcd",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);
      const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
      for (const p of pins) {
        const icon = L.divIcon({ className: "map-pin-wrap", html: `<span class="map-pin" data-pin="${esc(p.id)}">${esc(p.price)}</span>`, iconSize: undefined });
        const marker = L.marker([p.lat, p.lng], { icon, title: p.title, riseOnHover: true }).addTo(map);
        marker.bindPopup(
          `<a class="map-card" href="${esc(p.href)}">${p.img ? `<img src="${esc(p.img)}" alt="">` : ""}<span class="map-card-body"><b>${esc(p.title)}</b><span>${esc(p.sub)}</span><span class="map-card-price">${esc(p.price)}</span></span></a>`,
          { closeButton: true, maxWidth: 260, minWidth: 220, className: "map-popup" },
        );
      }
      if (pins.length) map.fitBounds(L.latLngBounds(pins.map(p => [p.lat, p.lng] as [number, number])).pad(0.2), { maxZoom: 14 });
      else map.setView([40.4406, -79.9959], 11);
      document.addEventListener("mouseover", onHover);
      document.addEventListener("mouseout", onHover);
      window.addEventListener("sevgio:map-shown", resize);
    })();
    return () => {
      cancelled = true;
      document.removeEventListener("mouseover", onHover);
      document.removeEventListener("mouseout", onHover);
      window.removeEventListener("sevgio:map-shown", resize);
      map?.remove();
    };
  }, [pins]);
  return <div ref={el} className="stays-map" role="region" aria-label="Map of stays" data-pins={pins.length} />;
}

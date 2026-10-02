"use client";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapPin = { id: string; lat: number; lng: number; price: string; title: string; sub: string; href: string; img: string | null };

// OpenFreeMap's "Liberty" style: a clean Google-Maps-like street map (light streets, green parks, blue rivers).
// Free, no account or key, no usage limits.
const STYLE = "https://tiles.openfreemap.org/styles/liberty";

/** Search results map: a price pin for each stay. Hovering a card lights up its pin; tapping a pin shows the stay. */
export function StaysMap({ pins }: { pins: MapPin[] }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("maplibre-gl").Map | null = null;
    let cancelled = false;
    const onHover = (e: Event) => {
      const id = (e.target as HTMLElement).closest?.("[data-pid]")?.getAttribute("data-pid");
      el.current?.querySelectorAll<HTMLElement>(".map-pin").forEach(m => m.classList.toggle("hot", m.dataset.pin === id && e.type === "mouseover"));
    };
    const resize = () => setTimeout(() => map?.resize(), 50);
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !el.current) return;
      map = new maplibregl.Map({
        container: el.current, style: STYLE, center: [-79.9959, 40.4406], zoom: 11,
        attributionControl: { compact: true }, cooperativeGestures: false, dragRotate: false, pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.FullscreenControl(), "top-right");
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
      for (const p of pins) {
        const node = document.createElement("button");
        node.type = "button";
        node.className = "map-pin";
        node.dataset.pin = p.id;
        node.textContent = p.price;
        node.setAttribute("aria-label", `${p.title}, ${p.price}`);
        const popup = new maplibregl.Popup({ offset: 18, maxWidth: "260px", className: "map-popup" }).setHTML(
          `<a class="map-card" href="${esc(p.href)}">${p.img ? `<img src="${esc(p.img)}" alt="">` : ""}<span class="map-card-body"><b>${esc(p.title)}</b><span>${esc(p.sub)}</span><span class="map-card-price">${esc(p.price)}</span></span></a>`,
        );
        new maplibregl.Marker({ element: node }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(map);
      }
      if (pins.length > 1) {
        // Open on where most stays are (Pittsburgh when it's a tie): a far-away one like Indiana, PA isn't framed, but its pin still shows.
        const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 85);
        const pgh = { lat: 40.4406, lng: -79.9959 };
        const score = (p: MapPin) => pins.filter(q => km(p, q) < 30).length * 1000 - km(p, pgh);
        const center = pins.reduce((best, p) => (score(p) > score(best) ? p : best), pins[0]);
        const near = pins.filter(p => km(p, center) < 30);
        const b = new maplibregl.LngLatBounds();
        (near.length ? near : pins).forEach(p => b.extend([p.lng, p.lat]));
        map.fitBounds(b, { padding: 60, maxZoom: 14, duration: 0 });
        if (near.length === 1) map.jumpTo({ center: [near[0].lng, near[0].lat], zoom: 12 });
      } else if (pins.length === 1) map.jumpTo({ center: [pins[0].lng, pins[0].lat], zoom: 13 });
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

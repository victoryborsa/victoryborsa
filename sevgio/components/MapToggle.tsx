"use client";
import { useState } from "react";

/** Phones: switch between the list and the map, like Airbnb's floating "Map" button. */
export function MapToggle() {
  const [map, setMap] = useState(false);
  const flip = () => {
    const next = !map;
    setMap(next);
    document.querySelector(".results-split")?.classList.toggle("show-map", next);
    if (next) window.dispatchEvent(new Event("sevgio:map-shown"));
    window.scrollTo({ top: 0 });
  };
  return <button type="button" className="map-toggle" onClick={flip}>{map ? "☰ Show list" : "🗺️ Show map"}</button>;
}

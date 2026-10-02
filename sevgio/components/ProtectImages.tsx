"use client";
import { useEffect } from "react";

/** Makes photos harder to save: no right-click "Save image", no dragging them off the page. (Screenshots can't be blocked by any website.) */
export function ProtectImages() {
  useEffect(() => {
    const stop = (e: Event) => { if ((e.target as HTMLElement)?.tagName === "IMG") e.preventDefault(); };
    document.addEventListener("contextmenu", stop);
    document.addEventListener("dragstart", stop);
    return () => { document.removeEventListener("contextmenu", stop); document.removeEventListener("dragstart", stop); };
  }, []);
  return null;
}

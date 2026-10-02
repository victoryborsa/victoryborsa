"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Pages that belong to a signed-in person (their trips, bookings, admin tools): copying and printing stay allowed there.
const PRIVATE = ["/trips", "/admin", "/host", "/account", "/book", "/verify", "/reset"];

/**
 * Makes the public pages hard to copy: no right-click menu, no "Save page", "View source" or "Print" shortcuts,
 * no selecting text, no dragging or long-press saving photos. (No website can block screenshots.)
 */
export function ProtectPage() {
  const path = usePathname() || "/";
  const open = PRIVATE.some(p => path === p || path.startsWith(p + "/"));
  useEffect(() => {
    document.documentElement.dataset.protect = open ? "off" : "on";
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && !!el.closest("input, textarea, select, [contenteditable], .selectable");
    const menu = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.tagName === "IMG" || (!open && !typing(e.target))) e.preventDefault();
    };
    const drag = (e: DragEvent) => { if ((e.target as HTMLElement)?.tagName === "IMG" || !open) e.preventDefault(); };
    const keys = (e: KeyboardEvent) => {
      if (open) return;
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      // Save page, view source, print, developer tools.
      if ((mod && ["s", "u", "p"].includes(k)) || (mod && e.shiftKey && ["i", "j", "c"].includes(k)) || (e.metaKey && e.altKey && ["i", "j", "c", "u"].includes(k)) || e.key === "F12") e.preventDefault();
    };
    const copy = (e: ClipboardEvent) => { if (!open && !typing(e.target)) e.preventDefault(); };
    document.addEventListener("contextmenu", menu);
    document.addEventListener("dragstart", drag);
    document.addEventListener("keydown", keys);
    document.addEventListener("copy", copy);
    return () => {
      document.removeEventListener("contextmenu", menu);
      document.removeEventListener("dragstart", drag);
      document.removeEventListener("keydown", keys);
      document.removeEventListener("copy", copy);
    };
  }, [open]);
  return null;
}

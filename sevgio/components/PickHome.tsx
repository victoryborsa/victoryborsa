"use client";
import { useEffect } from "react";

/** On the Corporate Housing page, "Request this home" pre-selects that home in the request form. */
export function PickHome() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[data-home]");
      if (!a) return;
      e.preventDefault();
      const sel = document.getElementById("ch-home") as HTMLSelectElement | null;
      if (sel) sel.value = a.getAttribute("data-home") || "";
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("request")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
      (document.querySelector("#request input[name=name]") as HTMLInputElement | null)?.focus({ preventScroll: true });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}

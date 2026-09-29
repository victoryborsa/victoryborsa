"use client";
import { useEffect, useRef } from "react";

/** Submits the surrounding form whenever one of its fields changes, so filters apply instantly. */
export function AutoSubmit() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onChange = () => form.requestSubmit();
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);
  return <span ref={ref} hidden />;
}

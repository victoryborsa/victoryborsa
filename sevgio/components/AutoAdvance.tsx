"use client";
import { useEffect, useRef } from "react";

/** Search form: once the dates are picked (see DateRangeField), go to Guests; after Guests, the Search button. */
export function AutoAdvance() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const guests = form.querySelector<HTMLSelectElement>('select[name="guests"]');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const onDates = () => {
      if (!guests) return;
      guests.focus();
      try { guests.showPicker?.(); } catch { /* some browsers only open the list on a direct tap; it's still selected */ }
    };
    const onChange = (e: Event) => { if (e.target === guests) submit?.focus(); };
    form.addEventListener("sevgio:dates-picked", onDates);
    form.addEventListener("change", onChange);
    return () => { form.removeEventListener("sevgio:dates-picked", onDates); form.removeEventListener("change", onChange); };
  }, []);
  return <span ref={ref} hidden />;
}

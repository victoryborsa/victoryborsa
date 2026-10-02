"use client";
import { useEffect, useRef } from "react";

const nextDay = (d: string) => new Date(Date.parse(d + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
/** Moves to a field and opens its picker where the browser allows (the date wheel on phones, the calendar on computers). */
function open(el: HTMLInputElement | HTMLSelectElement | HTMLButtonElement | null) {
  if (!el) return;
  el.focus();
  try { (el as HTMLInputElement).showPicker?.(); } catch { /* some browsers only open pickers on a direct tap; the field is still selected */ }
}

/** Search form: after Where, go to Check-in; after Check-in, Check-out; after Check-out, Guests; then the Search button. */
export function AutoAdvance() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const ci = form.querySelector<HTMLInputElement>('input[name="ci"]');
    const co = form.querySelector<HTMLInputElement>('input[name="co"]');
    const guests = form.querySelector<HTMLSelectElement>('select[name="guests"]');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    // A date counts once it's a real one (typing a year on a computer passes through years like 0002 first).
    const real = (el: HTMLInputElement | null) => !!el?.value && (!el.min || el.value >= el.min);
    const onWhere = () => open(ci);
    const onChange = (e: Event) => {
      const t = e.target;
      if (t === ci && real(ci) && co) {
        co.min = nextDay(ci!.value);
        if (co.value && co.value <= ci!.value) co.value = "";
        open(co);
      } else if (t === co && real(co)) open(guests);
      else if (t === guests) submit?.focus();
    };
    form.addEventListener("sevgio:where-picked", onWhere);
    form.addEventListener("change", onChange);
    return () => { form.removeEventListener("sevgio:where-picked", onWhere); form.removeEventListener("change", onChange); };
  }, []);
  return <span ref={ref} hidden />;
}

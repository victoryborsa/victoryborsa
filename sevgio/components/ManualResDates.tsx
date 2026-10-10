"use client";
import { useEffect, useRef, useState } from "react";
import { DateRangePicker } from "./DatePicker.tsx";

/** Check-in / check-out for Add Manual Reservation: the chosen property's booked and blocked nights can't be picked. */
export function ManualResDates({ today, takenBy }: { today: string; takenBy: Record<string, string[]> }) {
  const [property, setProperty] = useState("");
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const select = ref.current?.closest("form")?.querySelector<HTMLSelectElement>('select[name="property"]');
    if (!select) return;
    const on = () => setProperty(select.value);
    on();
    select.addEventListener("change", on);
    return () => select.removeEventListener("change", on);
  }, []);
  return (
    <>
      <span ref={ref} hidden />
      <DateRangePicker key={property} id="mr-dates" today={today} min={today} maxMonths={36} required names={["check_in", "check_out"]}
        labels={["Check-in date", "Check-out date"]} taken={takenBy[property]} hint={property ? undefined : "Choose the property first to see which dates are already booked."} />
    </>
  );
}

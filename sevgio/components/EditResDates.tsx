"use client";
import { DateRangePicker } from "./DatePicker.tsx";

/** Check-in / check-out on Edit reservation: starts on the current dates; other reservations' nights can't be picked. */
export function EditResDates({ today, taken, ci, co }: { today: string; taken: string[]; ci: string; co: string }) {
  return (
    <DateRangePicker id="er-dates" today={today} min={ci < today ? ci : today} maxMonths={36} required names={["check_in", "check_out"]}
      labels={["Check-in date", "Check-out date"]} taken={taken} initial={{ ci, co }} />
  );
}

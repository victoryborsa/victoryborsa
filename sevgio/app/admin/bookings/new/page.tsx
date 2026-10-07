import Link from "next/link";
import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { todayLocal } from "@/lib/dates.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { addManualReservationAction } from "@/app/actions/host.ts";

export default async function AddManualReservation() {
  await requireUser(["admin"], "/admin/bookings/new");
  // Whole homes first, each followed by its rooms, so the list reads like the calendar.
  const homes = await q<{ id: string; label: string; status: string }>(
    `SELECT p.id, CASE WHEN h.id IS NULL THEN p.title ELSE h.title || ' – ' || p.title END AS label, p.status
     FROM properties p LEFT JOIN properties h ON h.id = p.parent_id
     ORDER BY coalesce(h.title, p.title), p.parent_id IS NOT NULL, p.title`);
  const today = todayLocal();
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 640 }}>
      <p><Link href="/admin/bookings">‹ Back to Bookings</Link></p>
      <h2 style={{ margin: 0 }}>Add Manual Reservation</h2>
      <p className="muted" style={{ margin: 0 }}>For a guest who called or wrote to you. The reservation is confirmed right away with nothing paid, the dates are blocked on your calendar, and the guest is emailed a confirmation saying payment is due at the property. The price comes from the property&rsquo;s normal rates.</p>
      <ActionForm action={addManualReservationAction} className="box stack">
        <label className="field"><span>Property</span>
          <select className="input" name="property" required defaultValue="">
            <option value="" disabled>Choose a property</option>
            {homes.map(h => <option key={h.id} value={h.id}>{h.label}{h.status === "published" ? "" : ` (${h.status})`}</option>)}
          </select>
        </label>
        <label className="field"><span>Guest name</span><input className="input" name="name" autoComplete="off" required /></label>
        <div className="grid-2">
          <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="off" required /></label>
          <label className="field"><span>Phone number</span><input className="input" name="phone" type="tel" autoComplete="off" /></label>
        </div>
        <div className="grid-2">
          <label className="field"><span>Check-in date</span><input className="input" name="check_in" type="date" defaultValue={today} required /></label>
          <label className="field"><span>Check-out date</span><input className="input" name="check_out" type="date" required /></label>
        </div>
        <div><SubmitButton pendingText="Checking dates and saving…">Save Reservation</SubmitButton></div>
      </ActionForm>
    </div>
  );
}

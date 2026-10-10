"use client";
import { usePathname } from "next/navigation";

/** A reservation search box in the admin header, on every admin page except Bookings (which has the big one). */
export function AdminFind() {
  const path = usePathname();
  if (path === "/admin/bookings") return null;
  return (
    <form className="admin-find" method="get" action="/admin/bookings" role="search" aria-label="Find a reservation">
      <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      <input className="input" type="search" name="q" placeholder="Find a booking: reference or guest name" aria-label="Booking reference or guest name" autoComplete="off" spellCheck={false} enterKeyHint="search" maxLength={80} />
    </form>
  );
}

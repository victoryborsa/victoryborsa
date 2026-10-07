// Confirmation messages shown after an action that changes the page (so the message can't vanish with the row it came from).
const MESSAGES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  accepted: { tone: "ok", text: "Request accepted. The guest has been emailed their confirmation." },
  declined: { tone: "ok", text: "Request declined. The guest has been told and the dates are open again." },
  cancelled: { tone: "warn", text: "Booking cancelled and the guest has been emailed." },
  guestcancelled: { tone: "ok", text: "Booking cancelled. The host has been told." },
  deleted: { tone: "ok", text: "Listing deleted." },
  paid: { tone: "ok", text: "Payment recorded. The guest has been emailed." },
  paylinksent: { tone: "ok", text: "Payment link emailed to the guest." },
  datesChanged: { tone: "ok", text: "Your dates are changed. We've emailed you the updated booking." },
  resadded: { tone: "ok", text: "Reservation added. Its dates are now blocked on Sevgio." },
  resdeleted: { tone: "ok", text: "Reservation deleted." },
  manualadded: { tone: "ok", text: "Reservation saved. The dates are blocked on your calendar and the guest has been emailed a confirmation." },
  edited: { tone: "ok", text: "Reservation updated. The calendar shows the new details and the guest has been emailed what changed." },
  editednomail: { tone: "warn", text: "Reservation updated, but the email to the guest couldn't be sent. Check Operations." },
  nochange: { tone: "ok", text: "Nothing was changed." },
  refunded: { tone: "ok", text: "Marked as refunded." },
  manualnomail: { tone: "warn", text: "Reservation saved and the dates are blocked, but the confirmation email couldn't be sent. Check the Operations log." },
};

export function Flash({ msg }: { msg?: string }) {
  const m = msg ? MESSAGES[msg] : undefined;
  if (!m) return null;
  return <div className={`notice ${m.tone}`} role="status" style={{ marginBottom: 16 }}>{m.text}</div>;
}

export function withMsg(path: string, msg: string) {
  const clean = path.replace(/([?&])msg=[^&]*&?/, "$1").replace(/[?&]$/, "");
  return clean + (clean.includes("?") ? "&" : "?") + "msg=" + msg;
}

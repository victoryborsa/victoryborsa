// Confirmation messages shown after an action that changes the page (so the message can't vanish with the row it came from).
const MESSAGES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  accepted: { tone: "ok", text: "Request accepted. The guest has been emailed their confirmation." },
  declined: { tone: "ok", text: "Request declined. The guest has been told and the dates are open again." },
  cancelled: { tone: "warn", text: "Booking cancelled and the guest has been emailed." },
  guestcancelled: { tone: "ok", text: "Booking cancelled. The host has been told." },
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

"use server";
import { one, q } from "@/lib/db.ts";
import { currentUser } from "@/lib/auth.ts";
import { isEmail, str, type ActionState } from "@/lib/validate.ts";
import { sendEmail, siteUrl } from "@/lib/email.ts";
import { getSettings } from "@/lib/settings.ts";

async function tooMany(email: string) {
  const r = await one<{ n: number }>("SELECT count(*) AS n FROM messages WHERE lower(email) = lower($1) AND created_at > now() - interval '1 hour'", [email]);
  return !!r && r.n >= 8;
}

export async function askHostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (str(fd, "website")) return { ok: "Question sent." }; // spam bot filled the hidden field
  const name = str(fd, "name", 120), email = str(fd, "email", 254), body = str(fd, "body", 4000), propertyId = str(fd, "property_id", 40);
  if (!name || !isEmail(email)) return { error: "Add your name and a valid email so the host can reply." };
  if (body.length < 5) return { error: "Write your question before sending." };
  if (await tooMany(email)) return { error: "You've sent several messages recently. Please wait a little before sending more." };
  const p = await one<{ id: string; title: string; host_email: string }>("SELECT p.id, p.title, u.email AS host_email FROM properties p JOIN users u ON u.id = p.host_id WHERE p.id = $1", [propertyId]);
  if (!p) return { error: "This listing no longer exists." };
  const u = await currentUser();
  await q("INSERT INTO messages (property_id, user_id, name, email, topic, body) VALUES ($1, $2, $3, $4, $5, $6)", [p.id, u?.id ?? null, name, email, "Question about " + p.title, body]);
  await sendEmail(p.host_email, `Question about ${p.title} from ${name}`, `${name} (${email}) asked:\n\n${body}\n\nReply directly to ${email}, or see all messages at ${siteUrl()}/host/messages`);
  return { ok: "Question sent. The host usually replies within a few hours." };
}

export async function contactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (str(fd, "website")) return { ok: "Message sent." };
  const name = str(fd, "name", 120), email = str(fd, "email", 254), topic = str(fd, "topic", 80), msg = str(fd, "body", 4000);
  // Optional details for an existing reservation; none of them are required.
  const ref = str(fd, "reservation", 40).toUpperCase(), phone = str(fd, "phone", 40), checkIn = str(fd, "check_in", 10), home = str(fd, "property", 40);
  if (!name || !isEmail(email)) return { error: "Add your name and a valid email address." };
  if (msg.length < 5) return { error: "Write a message before sending." };
  if (checkIn && !/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return { error: "Choose the check-in date from the calendar, or leave it empty." };
  if (await tooMany(email)) return { error: "You've sent several messages recently. Please wait a little before sending more." };
  const p = /^[0-9a-f-]{36}$/i.test(home) ? await one<{ id: string; title: string }>("SELECT id, title FROM properties WHERE id = $1 AND status = 'published'", [home]) : null;
  const booking = ref ? await one<{ code: string }>("SELECT code FROM bookings WHERE upper(code) = $1", [ref]) : null;
  const details = [["Reservation number", ref ? (booking ? ref : `${ref} (not found on Sevgio; it may be from another site)`) : ""], ["Phone", phone], ["Property", p?.title || ""], ["Check-in date", checkIn]]
    .filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  const body = details ? `${details}\n\n${msg}` : msg;
  const u = await currentUser();
  await q("INSERT INTO messages (property_id, user_id, name, email, topic, body) VALUES ($1, $2, $3, $4, $5, $6)", [p?.id ?? null, u?.id ?? null, name, email, topic, body]);
  const s = await getSettings();
  const link = booking ? `\nReservation: ${siteUrl()}/admin/bookings/${booking.code}` : "";
  if (s.contact_email) await sendEmail(s.contact_email, `[Sevgio contact] ${topic} from ${name}`, `${name} (${email}) wrote:\n\n${body}\n${link}\nSee all messages: ${siteUrl()}/admin/messages`);
  return { ok: `Message sent. We'll reply to ${email}.` };
}

export async function corporateRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (str(fd, "website")) return { ok: "Request sent." };
  const f = {
    name: str(fd, "name", 120), company: str(fd, "company", 160), email: str(fd, "email", 254), phone: str(fd, "phone", 40), who: str(fd, "who", 80),
    guests: str(fd, "guests", 10), movein: str(fd, "movein", 20), length: str(fd, "length", 40), home: str(fd, "home", 40), area: str(fd, "area", 160),
    budget: str(fd, "budget", 40), pets: str(fd, "pets", 10), notes: str(fd, "notes", 4000),
  };
  if (!f.name || !isEmail(f.email)) return { error: "Add your name and a valid email so we can reply." };
  if (!f.movein) return { error: "Choose a move-in date (an approximate one is fine)." };
  if (await tooMany(f.email)) return { error: "You've sent several messages recently. Please wait a little before sending more." };
  const home = /^[0-9a-f-]{36}$/i.test(f.home) ? await one<{ id: string; title: string }>("SELECT id, title FROM properties WHERE id = $1 AND corp_listed", [f.home]) : null;
  const body = [
    ["I am", f.who], ["Company or agency", f.company], ["Phone", f.phone], ["Guests", f.guests], ["Move-in date", f.movein], ["Length of stay", f.length],
    ["Home", home?.title || "Any home or room that fits"], ["Area or workplace", f.area], ["Monthly budget", f.budget], ["Pets", f.pets],
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n") + (f.notes ? `\n\n${f.notes}` : "");
  const topic = "Corporate housing request" + (f.company ? ` (${f.company})` : "");
  const u = await currentUser();
  await q("INSERT INTO messages (property_id, user_id, name, email, topic, body) VALUES ($1, $2, $3, $4, $5, $6)", [home?.id ?? null, u?.id ?? null, f.name, f.email, topic, body]);
  const s = await getSettings();
  if (s.contact_email) await sendEmail(s.contact_email, `[Sevgio] ${topic} from ${f.name}`, `${f.name} (${f.email}) sent a corporate housing request:\n\n${body}\n\nReply directly to ${f.email}, or see all messages at ${siteUrl()}/admin/messages`);
  return { ok: `Request sent. We'll reply to ${f.email} within 24 hours.` };
}

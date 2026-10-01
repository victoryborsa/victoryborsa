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
  const name = str(fd, "name", 120), email = str(fd, "email", 254), topic = str(fd, "topic", 80), body = str(fd, "body", 4000);
  if (!name || !isEmail(email)) return { error: "Add your name and a valid email address." };
  if (body.length < 5) return { error: "Write a message before sending." };
  if (await tooMany(email)) return { error: "You've sent several messages recently. Please wait a little before sending more." };
  const u = await currentUser();
  await q("INSERT INTO messages (user_id, name, email, topic, body) VALUES ($1, $2, $3, $4, $5)", [u?.id ?? null, name, email, topic, body]);
  const s = await getSettings();
  if (s.contact_email) await sendEmail(s.contact_email, `[Sevgio Stays contact] ${topic} from ${name}`, `${name} (${email}) wrote:\n\n${body}\n\nSee all messages: ${siteUrl()}/admin/messages`);
  return { ok: `Message sent. We'll reply to ${email}.` };
}

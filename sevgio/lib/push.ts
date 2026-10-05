import "server-only";
import webpush from "web-push";
import { one, q } from "./db.ts";
import { siteUrl } from "./email.ts";

export type PushMessage = { title: string; body: string; url: string; tag?: string };

let keys: { publicKey: string; privateKey: string } | null = null;

/** The site's push keys: from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY when set, otherwise made once and kept in the database. */
export async function pushKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (keys) return keys;
  const pub = (process.env.VAPID_PUBLIC_KEY || "").trim(), priv = (process.env.VAPID_PRIVATE_KEY || "").trim();
  if (pub && priv) return (keys = { publicKey: pub, privateKey: priv });
  const fresh = webpush.generateVAPIDKeys();
  await q("INSERT INTO settings (key, value) VALUES ('push_keys', $1) ON CONFLICT (key) DO NOTHING", [JSON.stringify(fresh)]);
  const row = await one<{ value: { publicKey: string; privateKey: string } }>("SELECT value FROM settings WHERE key = 'push_keys'");
  return (keys = row!.value);
}

/** Sends a notification to every phone or computer these users turned alerts on for. Dead subscriptions are removed. */
export async function pushToUsers(userIds: string[], msg: PushMessage | ((userId: string) => PushMessage)): Promise<{ sent: number; failed: number; devices: number }> {
  const subs = await q<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string }>(
    "SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1)", [userIds]);
  if (!subs.length) return { sent: 0, failed: 0, devices: 0 };
  const k = await pushKeys();
  const subject = process.env.VAPID_SUBJECT || (siteUrl().startsWith("https://") ? siteUrl() : "mailto:admin@sevgio.com");
  let sent = 0, failed = 0;
  await Promise.all(subs.map(async s => {
    const m = typeof msg === "function" ? msg(s.user_id) : msg;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m),
        { vapidDetails: { subject, publicKey: k.publicKey, privateKey: k.privateKey }, TTL: 24 * 3600, urgency: "high", timeout: 10_000 });
      sent++;
      await q("UPDATE push_subscriptions SET last_success_at = now(), last_error = '' WHERE id = $1", [s.id]);
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      // 404/410: the browser dropped this subscription (alerts turned off, app removed).
      if (code === 404 || code === 410) await q("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
      else await q("UPDATE push_subscriptions SET last_error = $2 WHERE id = $1", [s.id, String((e as Error).message || e).slice(0, 300)]);
    }
  }));
  return { sent, failed, devices: subs.length };
}

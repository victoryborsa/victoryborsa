import "server-only";
import { q } from "./db.ts";
import { FLAGS, envOverride, flagKeys, type FlagDef } from "./flag-list.ts";

export { FLAGS, flagKeys, type FlagDef };

const settingKey = (key: string) => "flag:" + key;

export type FlagState = FlagDef & { on: boolean; saved: boolean; forced: boolean | null };

/** All switches with their current state, for the admin page. */
export async function flagStates(): Promise<FlagState[]> {
  const rows = await q<{ key: string; value: unknown }>("SELECT key, value FROM settings WHERE key LIKE 'flag:%'");
  const saved = new Map(rows.map(r => [r.key, r.value === true]));
  return FLAGS.map(f => {
    const forced = envOverride(process.env[f.key]);
    const s = saved.get(settingKey(f.key)) ?? false;
    return { ...f, saved: s, forced, on: f.ready && (forced ?? s) };
  });
}

/** Whether a feature is on. Off until it is built and switched on (or forced on in Render). */
export async function isOn(key: string): Promise<boolean> {
  const f = FLAGS.find(x => x.key === key);
  if (!f?.ready) return false;
  const forced = envOverride(process.env[key]);
  if (forced !== null) return forced;
  const r = await q<{ value: unknown }>("SELECT value FROM settings WHERE key = $1", [settingKey(key)]);
  return r[0]?.value === true;
}

export async function saveFlag(key: string, on: boolean) {
  await q("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [settingKey(key), JSON.stringify(on)]);
}

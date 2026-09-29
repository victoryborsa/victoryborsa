import { q } from "./db.ts";

export type Settings = { tax_percent: number; contact_email: string; contact_phone: string; payment_note: string; site_notice: string };

export async function getSettings(): Promise<Settings> {
  const rows = await q<{ key: string; value: unknown }>("SELECT key, value FROM settings");
  const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    tax_percent: Number(m.tax_percent ?? 0),
    contact_email: String(m.contact_email ?? ""),
    contact_phone: String(m.contact_phone ?? ""),
    payment_note: String(m.payment_note ?? ""),
    site_notice: String(m.site_notice ?? ""),
  };
}

export async function saveSetting(key: keyof Settings, value: unknown) {
  await q("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, JSON.stringify(value)]);
}

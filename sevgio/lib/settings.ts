import { q } from "./db.ts";

export type Settings = {
  tax_percent: number; contact_email: string; contact_phone: string; payment_note: string; site_notice: string;
  pay_card: boolean; pay_ach: boolean; pay_zelle: boolean; pay_venmo: boolean; pay_cash: boolean; pay_later: boolean;
  card_fee_percent: number; card_fee_fixed_cents: number; zelle_to: string; venmo_handle: string; cashapp_handle: string;
  /** Flat card fee on corporate-housing reservations entered by an admin (e.g. $3), instead of the percentage. */
  corporate_card_fee_cents: number;
  deposit_percent: number; manual_payment_hours: number;
  listing_fee_enabled: boolean; listing_fee_cents: number;
};

export async function getSettings(): Promise<Settings> {
  const rows = await q<{ key: string; value: unknown }>("SELECT key, value FROM settings");
  const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const num = (k: string, d: number) => (Number.isFinite(Number(m[k])) ? Number(m[k]) : d);
  return {
    tax_percent: num("tax_percent", 0),
    contact_email: String(m.contact_email ?? ""),
    contact_phone: String(m.contact_phone ?? ""),
    payment_note: String(m.payment_note ?? ""),
    site_notice: String(m.site_notice ?? ""),
    pay_card: m.pay_card === true, pay_ach: m.pay_ach === true, pay_zelle: m.pay_zelle === true, pay_venmo: m.pay_venmo === true, pay_cash: m.pay_cash === true,
    // On unless switched off: guests may book now and pay at the property, or online later from their booking page.
    pay_later: m.pay_later !== false,
    card_fee_percent: num("card_fee_percent", 2.9), card_fee_fixed_cents: num("card_fee_fixed_cents", 30),
    zelle_to: String(m.zelle_to ?? ""), venmo_handle: String(m.venmo_handle ?? ""), cashapp_handle: String(m.cashapp_handle ?? ""),
    corporate_card_fee_cents: num("corporate_card_fee_cents", 300),
    deposit_percent: num("deposit_percent", 30), manual_payment_hours: num("manual_payment_hours", 24),
    listing_fee_enabled: m.listing_fee_enabled !== false, listing_fee_cents: num("listing_fee_cents", 10000),
  };
}

export async function saveSetting(key: keyof Settings, value: unknown) {
  await q("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, JSON.stringify(value)]);
}

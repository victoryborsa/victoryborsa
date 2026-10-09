// Pure payment math, shared by the browser and the server.
export type PayMethod = "card" | "ach" | "zelle" | "venmo" | "cashapp" | "cash";

export const METHOD_LABEL: Record<PayMethod, string> = {
  card: "Credit or debit card",
  ach: "Bank transfer (ACH)",
  zelle: "Zelle",
  venmo: "Venmo",
  cashapp: "Cash App",
  cash: "Cash at arrival (deposit by Zelle or Venmo)",
};

/** A booking marked cash with no deposit due is paid at the property (reservations the host enters by hand). */
export const paysAtProperty = (b: { payment_method: string | null; due_now_cents?: number }) => b.payment_method === "cash" && b.due_now_cents === 0;

/** How a booking is paid, for its record and invoice. */
export const methodLabel = (b: { payment_method: PayMethod | null; due_now_cents?: number }) =>
  !b.payment_method ? "" : paysAtProperty(b) ? "Pay at the property" : METHOD_LABEL[b.payment_method];

/** Card processing fee added to the guest's total, so the host receives the full price. */
export function cardFee(totalCents: number, percent: number, fixedCents: number): number {
  if (totalCents <= 0 || (percent <= 0 && fixedCents <= 0)) return 0;
  // Gross up: the fee is charged on the fee too.
  const gross = Math.ceil((totalCents + fixedCents) / (1 - percent / 100));
  return gross - totalCents;
}

/** What the guest pays now for a method: the full amount (plus card fee), or a deposit for cash at arrival. */
export function dueNow(method: PayMethod, totalCents: number, s: { card_fee_percent: number; card_fee_fixed_cents: number; deposit_percent: number }) {
  const fee = method === "card" ? cardFee(totalCents, s.card_fee_percent, s.card_fee_fixed_cents) : 0;
  const now = method === "cash" ? Math.round((totalCents * s.deposit_percent) / 100) : totalCents + fee;
  return { fee, now, later: method === "cash" ? totalCents - now : 0 };
}

/** The card fee for paying `amountCents` of a booking: a corporate reservation's flat fee (e.g. $3), or the site's percentage. */
export function bookingCardFee(b: { card_fee_flat_cents?: number | null }, amountCents: number, s: { card_fee_percent: number; card_fee_fixed_cents: number }): number {
  if (amountCents <= 0) return 0;
  return b.card_fee_flat_cents != null ? b.card_fee_flat_cents : cardFee(amountCents, s.card_fee_percent, s.card_fee_fixed_cents);
}

/** What's owed now on a fixed-price corporate reservation: the rest of the deposit until it's paid, then the balance. */
export function corporateDue(b: { total_cents: number; paid_cents: number; deposit_due_cents?: number }) {
  const balance = Math.max(0, b.total_cents - b.paid_cents);
  const depositLeft = Math.min(balance, Math.max(0, (b.deposit_due_cents ?? 0) - b.paid_cents));
  return { balance, depositLeft };
}

import "server-only";
import Stripe from "stripe";
import type { Settings } from "./settings.ts";
import type { PayMethod } from "./payment-rules.ts";

export const stripeReady = () => !!process.env.STRIPE_SECRET_KEY;
let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe isn't set up (STRIPE_SECRET_KEY is missing).");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

/** Payment methods guests can choose right now. Card and bank transfer also need Stripe keys. */
export function enabledMethods(s: Settings): PayMethod[] {
  const out: PayMethod[] = [];
  if (s.pay_card && stripeReady()) out.push("card");
  if (s.pay_ach && stripeReady()) out.push("ach");
  if (s.pay_zelle && s.zelle_to) out.push("zelle");
  if (s.pay_venmo && s.venmo_handle) out.push("venmo");
  if (s.pay_cash && (s.zelle_to || s.venmo_handle)) out.push("cash");
  return out;
}

export const isOnline = (m: string | null) => m === "card" || m === "ach";

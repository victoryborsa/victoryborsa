import type Stripe from "stripe";
import { stripe } from "@/lib/payments.ts";
import { paymentFailed, recordPayment } from "@/lib/payment-flow.ts";
import { logEvent } from "@/lib/log.ts";

/** Stripe calls this when a checkout is paid (card), a bank transfer starts or clears, or a bank transfer fails. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook secret not configured", { status: 500 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, req.headers.get("stripe-signature") || "", secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }
  try {
    const s = event.data.object as Stripe.Checkout.Session;
    const bookingId = s.metadata?.booking_id;
    if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && bookingId && s.payment_status !== "no_payment_required") {
      await recordPayment(bookingId, s.amount_total ?? 0, {
        method: s.payment_method_types?.includes("us_bank_account") ? "ach" : "card",
        // A bank transfer reports "unpaid" at checkout and clears a few days later.
        processing: event.type === "checkout.session.completed" && s.payment_status === "unpaid",
        stripeSession: s.id,
        stripeIntent: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id,
      });
    } else if (event.type === "checkout.session.async_payment_failed") {
      await paymentFailed(s.id, "the bank declined the transfer");
    }
  } catch (e) {
    await logEvent("error", "Payment", `Stripe webhook ${event.type} failed`, { error: String(e) });
    return new Response("Error", { status: 500 }); // Stripe will retry
  }
  return Response.json({ received: true });
}

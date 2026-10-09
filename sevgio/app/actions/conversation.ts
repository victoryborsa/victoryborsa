"use server";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth.ts";
import { postMessage, type SendResult } from "@/lib/messaging.ts";

/** Sends a message in a reservation's conversation. `clientId` makes a repeated Send save only once. */
export async function sendBookingMessageAction(bookingId: string, body: string, clientId: string): Promise<SendResult> {
  const u = await currentUser();
  if (!u) return { ok: false, error: "Please sign in again." };
  const r = await postMessage(u, String(bookingId).slice(0, 40), String(body).slice(0, 4100), String(clientId).slice(0, 64));
  if (r.ok) { revalidatePath("/admin/calendar"); revalidatePath("/host/calendar"); }
  return r;
}

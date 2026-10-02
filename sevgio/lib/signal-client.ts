// Browser side of lib/signals.ts. keepalive lets the report finish even when the click navigates away (Reserve).
export async function sendSignal(slug: string, kind: "view" | "interested" | "share" | "favorite", extra: { channel?: string; on?: boolean } = {}): Promise<unknown> {
  try {
    const r = await fetch("/api/listing-signal", { method: "POST", body: JSON.stringify({ slug, kind, ...extra }), keepalive: true });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

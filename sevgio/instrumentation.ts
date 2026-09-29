// Records every unhandled server error in the admin "Errors & activity" log.
export async function onRequestError(err: unknown, request: { path: string; method: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logEvent } = await import("./lib/log.ts");
  const e = err as Error & { digest?: string };
  await logEvent("error", "Server", e.message || "Unhandled error", { path: request.path, method: request.method, digest: e.digest, stack: e.stack?.split("\n").slice(0, 6).join("\n") });
}

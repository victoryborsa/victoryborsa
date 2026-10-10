import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

function isPrivate(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

/** Fetches a public https URL only; refuses addresses on private networks so a pasted link can't probe internal services. */
export async function fetchPublic(url: string, timeoutMs = 20_000): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(current);
    if (u.protocol !== "https:") throw new Error("only https links are supported");
    const addrs = await dns.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some(a => isPrivate(a.address))) throw new Error("that address isn't allowed");
    // Follow redirects by hand so every hop is checked.
    const res = await fetch(u, { signal: AbortSignal.timeout(timeoutMs), redirect: "manual", headers: { "User-Agent": "Sevgio calendar sync" } });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) { current = new URL(loc, u).toString(); continue; }
    return res;
  }
  throw new Error("too many redirects");
}

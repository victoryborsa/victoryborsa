import { isLang } from "@/lib/i18n.ts";

/** Switches the site language: /lang/tr?next=/stays sets the cookie and goes back. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(req.url);
  const raw = url.searchParams.get("next") || "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";
  const headers = new Headers({ Location: next, "Cache-Control": "no-store" });
  if (isLang(code)) headers.append("Set-Cookie", `lang=${code}; Path=/; Max-Age=31536000; SameSite=Lax${url.protocol === "https:" ? "; Secure" : ""}`);
  return new Response(null, { status: 303, headers });
}

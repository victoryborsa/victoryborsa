import "server-only";
import { cookies } from "next/headers";
import { DICTS, EN, LANGS, type Key, type Lang } from "./i18n-data.ts";

export { LANGS, type Lang };
export const isLang = (s: unknown): s is Lang => LANGS.some(l => l.code === s);

/** The visitor's chosen language (from the "lang" cookie), English by default. */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get("lang")?.value;
  return isLang(v) ? v : "en";
}

export type T = (key: Key, vars?: Record<string, string | number>) => string;
export function translator(lang: Lang): T {
  const d = DICTS[lang];
  return (key, vars) => {
    let s = d[key] ?? EN[key];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

export async function getT(): Promise<{ lang: Lang; t: T }> {
  const lang = await getLang();
  return { lang, t: translator(lang) };
}

export const str = (fd: FormData, k: string, max = 5000) => String(fd.get(k) ?? "").trim().slice(0, max);
export const int = (fd: FormData, k: string) => {
  const n = Number(str(fd, k));
  return Number.isInteger(n) ? n : NaN;
};
export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
export const lines = (s: string) => s.split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 40);

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "stay";
}

export type ActionState = { error?: string; ok?: string } | null;

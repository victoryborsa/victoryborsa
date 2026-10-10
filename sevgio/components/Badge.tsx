import { Icon, type IconName } from "./Icon.tsx";

export type Tone = "ok" | "warn" | "danger" | "neutral" | "info";

/** A status pill with an icon, so the meaning never depends on color alone. */
export function Badge({ tone, icon, children, title }: { tone: Tone; icon: IconName; children: React.ReactNode; title?: string }) {
  return <span className={`pill ${tone} pill-ic`} title={title}><Icon name={icon} size={13} />{children}</span>;
}

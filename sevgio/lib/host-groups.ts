/** Admin listing pages: listings grouped under their host, hosts A–Z and each host's listings A–Z. */

export type HostGroup<T> = { hostId: string; hostName: string; rows: T[] };

const byName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true });

/** Groups rows by host. `hostFilter` (a host id) keeps only that host's group; empty or unknown keeps all. */
export function groupByHost<T extends { host_id: string; host_name: string | null; title: string }>(rows: T[], hostFilter = ""): { groups: HostGroup<T>[]; hosts: { id: string; name: string; count: number }[]; selected: string } {
  const map = new Map<string, HostGroup<T>>();
  for (const r of rows) {
    const g = map.get(r.host_id) ?? { hostId: r.host_id, hostName: r.host_name?.trim() || "No host name", rows: [] };
    g.rows.push(r);
    map.set(r.host_id, g);
  }
  const all = [...map.values()].sort((a, b) => byName(a.hostName, b.hostName) || a.hostId.localeCompare(b.hostId));
  for (const g of all) g.rows.sort((a, b) => byName(a.title, b.title));
  const selected = map.has(hostFilter) ? hostFilter : "";
  return {
    groups: selected ? all.filter(g => g.hostId === selected) : all,
    hosts: all.map(g => ({ id: g.hostId, name: g.hostName, count: g.rows.length })),
    selected,
  };
}

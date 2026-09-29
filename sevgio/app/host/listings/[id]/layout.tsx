import Link from "next/link";
import { requireManageable } from "@/lib/access.ts";
import { SubNav } from "@/components/SubNav.tsx";

export default async function ListingLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { p } = await requireManageable(id, `/host/listings/${id}`);
  const base = `/host/listings/${p.id}`;
  return (
    <>
      <div className="crumbs" style={{ paddingTop: 0 }}><Link href="/host/listings">← Listings</Link></div>
      <div className="row" style={{ marginBottom: 4 }}>
        <h2 style={{ flex: 1 }}>{p.title}</h2>
        <span className={`pill ${p.status === "published" ? "ok" : p.status === "draft" ? "warn" : "neutral"}`}>{p.status === "published" ? "Live" : p.status === "draft" ? "Draft" : "Hidden"}</span>
        <Link className="btn btn-ghost btn-sm" href={`/stays/${p.slug}`}>View as guest</Link>
      </div>
      <SubNav links={[[base, "Details"], [base + "/photos", "Photos"], [base + "/calendar", "Calendar & sync"]]} />
      {children}
    </>
  );
}

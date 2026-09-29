import Link from "next/link";
import { requireUser } from "@/lib/auth.ts";
import { q } from "@/lib/db.ts";
import { ListingForm } from "@/components/ListingForm.tsx";
import { createListingAction } from "@/app/actions/host.ts";

export default async function NewListing() {
  const u = await requireUser(["host", "admin"], "/host/listings/new");
  const hosts = u.role === "admin" ? await q<{ id: string; name: string }>("SELECT id, name FROM users WHERE role IN ('host','admin') AND NOT disabled ORDER BY name") : undefined;
  return (
    <>
      <div className="crumbs" style={{ paddingTop: 0 }}><Link href="/host/listings">← Listings</Link></div>
      <h2 style={{ marginBottom: 16 }}>Add a listing</h2>
      <div style={{ maxWidth: 820 }}><ListingForm action={createListingAction} hosts={hosts} submitLabel="Save and add photos" /></div>
    </>
  );
}

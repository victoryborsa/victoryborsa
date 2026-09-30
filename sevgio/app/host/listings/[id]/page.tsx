import { requireManageable } from "@/lib/access.ts";
import { ListingForm } from "@/components/ListingForm.tsx";
import { homesFor } from "@/lib/homes.ts";
import { updateListingAction } from "@/app/actions/host.ts";

export default async function EditListing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { u, p } = await requireManageable(id);
  const homes = await homesFor(u, p.host_id);
  return <div style={{ maxWidth: 820 }}><ListingForm action={updateListingAction} p={p} homes={homes} submitLabel="Save listing" /></div>;
}

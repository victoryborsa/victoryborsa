import { requireManageable } from "@/lib/access.ts";
import { ListingForm } from "@/components/ListingForm.tsx";
import { updateListingAction } from "@/app/actions/host.ts";

export default async function EditListing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { p } = await requireManageable(id);
  return <div style={{ maxWidth: 820 }}><ListingForm action={updateListingAction} p={p} submitLabel="Save listing" /></div>;
}

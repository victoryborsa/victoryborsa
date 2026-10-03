import Link from "next/link";
import { requireUser } from "@/lib/auth.ts";
import { GuidePlaceForm } from "@/components/GuidePlaceForm.tsx";
import { SECTION_IDS, type PlaceFields } from "@/lib/guide-places.ts";

/** Add a place to the Pittsburgh guide (a local business, sight or sponsor). */
export default async function NewPlace({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  await requireUser(["admin"], "/admin/guide");
  const s = (await searchParams).section as PlaceFields["section"];
  const values: PlaceFields = { section: SECTION_IDS.includes(s) ? s : "eat", name: "", area: "", description: "", icon: "📍", address: "", map_query: "", website: "", phone: "", sponsored: false, sponsor_start: null, sponsor_end: null };
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="crumbs"><Link href="/admin/guide">← Pittsburgh guide</Link></div>
      <h2>Add a place</h2>
      <p className="muted">Save it as a draft to add photos and preview it first, or publish it straight away. New places go to the end of their category; move them up on the guide list.</p>
      <GuidePlaceForm values={values} />
    </div>
  );
}

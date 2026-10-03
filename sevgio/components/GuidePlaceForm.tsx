import { ActionForm, SubmitButton } from "./forms.tsx";
import { savePlaceAction } from "@/app/actions/guide.ts";
import { SECTION_IDS, SECTION_TITLE, type GuidePlace, type PlaceFields } from "@/lib/guide-places.ts";

/** Add or edit a guide place. Published places can save a private draft first; new ones start as drafts. */
export function GuidePlaceForm({ place, values }: { place?: GuidePlace; values: PlaceFields }) {
  const published = place?.status === "published";
  return (
    <ActionForm action={savePlaceAction} className="stack box gp-form">
      {place && <input type="hidden" name="id" value={place.id} />}
      <div className="grid-2">
        <label className="field"><span>Name</span><input className="input" name="name" defaultValue={values.name} required maxLength={120} placeholder="Primanti Bros." /></label>
        <label className="field"><span>Category</span>
          <select className="input" name="section" defaultValue={values.section}>{SECTION_IDS.map(id => <option key={id} value={id}>{SECTION_TITLE[id]}</option>)}</select>
        </label>
        <label className="field"><span>Neighborhood (shown under the name)</span><input className="input" name="area" defaultValue={values.area} maxLength={80} placeholder="Strip District" /></label>
        <label className="field"><span>Icon (shown until a photo is added)</span><input className="input" name="icon" defaultValue={values.icon} maxLength={8} placeholder="🥪" /></label>
      </div>
      <label className="field"><span>Description</span><textarea className="input" name="description" defaultValue={values.description} maxLength={400} rows={3} placeholder="One or two sentences guests will see on the card." /><span className="hint">Up to 400 characters. The card shows the first two lines.</span></label>
      <div className="grid-2">
        <label className="field"><span>Address (for directions)</span><input className="input" name="address" defaultValue={values.address} maxLength={200} placeholder="2 S 18th St, Pittsburgh, PA 15203" /><span className="hint">Leave empty to search Google Maps by the name.</span></label>
        <label className="field"><span>Map search name (optional)</span><input className="input" name="map_query" defaultValue={values.map_query} maxLength={120} placeholder="Used when there's no address" /></label>
        <label className="field"><span>Website (optional)</span><input className="input" name="website" defaultValue={values.website} maxLength={300} inputMode="url" placeholder="https://www.example.com" /></label>
        <label className="field"><span>Phone (optional)</span><input className="input" name="phone" defaultValue={values.phone} maxLength={40} inputMode="tel" placeholder="(412) 555-0100" /></label>
      </div>
      <fieldset className="smart-box gp-sponsor">
        <label className="chk"><input type="checkbox" name="sponsored" defaultChecked={values.sponsored} /><span><b>Sponsored listing</b><span className="hint" style={{ display: "block" }}>Shows a “Sponsored” label on the guide between these dates. It ends by itself after the end date.</span></span></label>
        <div className="grid-2">
          <label className="field"><span>Sponsorship starts</span><input className="input" type="date" name="sponsor_start" defaultValue={values.sponsor_start ?? ""} /><span className="hint">Empty: starts right away.</span></label>
          <label className="field"><span>Sponsorship ends</span><input className="input" type="date" name="sponsor_end" defaultValue={values.sponsor_end ?? ""} /><span className="hint">Empty: no end date.</span></label>
        </div>
      </fieldset>
      <div className="row" style={{ gap: 10 }}>
        <SubmitButton className="btn btn-primary" name="mode" value="publish" pendingText="Publishing…">{published ? "Publish changes" : "Save and publish"}</SubmitButton>
        <SubmitButton className="btn btn-ghost" name="mode" value="draft" pendingText="Saving…">{published ? "Save draft (not public yet)" : "Save as draft"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

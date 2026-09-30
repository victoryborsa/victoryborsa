import { AMENITIES, CANCELLATION } from "@/lib/constants.ts";
import { ListingKind } from "./ListingKind.tsx";
import type { Property } from "@/lib/bookings.ts";
import { ActionForm, SubmitButton } from "./forms.tsx";
import type { ActionState } from "@/lib/validate.ts";

const dollars = (c?: number) => (c === undefined ? "" : String(c / 100));

export function ListingForm({ action, p, hosts, homes = [], submitLabel }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; p?: Property; hosts?: { id: string; name: string }[]; homes?: { id: string; title: string; host_name?: string }[]; submitLabel: string }) {
  return (
    <ActionForm action={action} className="stack" id="listing-form">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="box">
        <h2>Basics</h2>
        {hosts && (
          <label className="field"><span>Host</span>
            <select className="input" name="host_id" defaultValue="">{[<option key="" value="">Choose a host…</option>, ...hosts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)]}</select>
          </label>
        )}
        <ListingKind propertyType={p?.property_type} parentId={p?.parent_id} homes={homes.filter(h => h.id !== p?.id)} />
        <label className="field"><span>Listing title</span><input className="input" name="title" defaultValue={p?.title} maxLength={120} placeholder="e.g. Lakeside Lodge with Hot Tub" required /></label>
        <div className="grid-2">
          <label className="field"><span>Visibility</span>
            <select className="input" name="status" defaultValue={p?.status || "draft"} disabled={!p}>
              <option value="draft">Draft (not visible)</option>
              <option value="published">Published (guests can book)</option>
              <option value="hidden">Hidden (paused)</option>
            </select>
            {!p && <><input type="hidden" name="status" value="draft" /><span className="hint">Add photos next, then publish.</span></>}
          </label>
        </div>
        <div className="grid-2">
          <label className="field"><span>Town or city</span><input className="input" name="city" defaultValue={p?.city} placeholder="e.g. Jim Thorpe" required /></label>
          <label className="field"><span>Area or region <span className="muted" style={{ fontWeight: 400 }}>(shown to guests)</span></span><input className="input" name="area" defaultValue={p?.area} placeholder="e.g. Poconos" /></label>
        </div>
        <label className="field"><span>Street address <span className="muted" style={{ fontWeight: 400 }}>(only shared after a booking is confirmed)</span></span><input className="input" name="address" defaultValue={p?.address} autoComplete="off" /></label>
        <label className="field"><span>Description</span><textarea className="input" name="description" defaultValue={p?.description} style={{ minHeight: 160 }} placeholder="What makes this place special? Describe the rooms, the view, and what's nearby." /></label>
      </div>

      <div className="box">
        <h2>Space</h2>
        <div className="grid-2">
          <label className="field"><span>Maximum guests</span><input className="input mono" name="max_guests" type="number" min={1} max={50} defaultValue={p?.max_guests ?? 4} /></label>
          <label className="field"><span>Bedrooms</span><input className="input mono" name="bedrooms" type="number" min={0} max={30} defaultValue={p?.bedrooms ?? 2} /></label>
          <label className="field"><span>Beds</span><input className="input mono" name="beds" type="number" min={0} max={50} defaultValue={p?.beds ?? 2} /></label>
          <label className="field"><span>Bathrooms</span><input className="input mono" name="bathrooms" type="number" min={0} max={20} step={0.5} defaultValue={p?.bathrooms ?? 1} /></label>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Bathroom</legend>
          <div className="row">
            <label className="chk"><input type="radio" name="bathroom_type" value="private" defaultChecked={(p?.bathroom_type || "private") === "private"} />Private (only these guests use it)</label>
            <label className="chk"><input type="radio" name="bathroom_type" value="shared" defaultChecked={p?.bathroom_type === "shared"} />Shared with other guests</label>
          </div>
        </fieldset>
      </div>

      <div className="box">
        <h2>Pricing and booking</h2>
        <div className="grid-2">
          <label className="field"><span>Nightly price (USD)</span><input className="input mono" name="nightly_price" inputMode="decimal" defaultValue={dollars(p?.nightly_price_cents)} placeholder="175" /></label>
          <label className="field"><span>Cleaning fee (USD, per stay)</span><input className="input mono" name="cleaning_fee" inputMode="decimal" defaultValue={dollars(p?.cleaning_fee_cents) || "0"} /></label>
          <label className="field"><span>Minimum nights</span><input className="input mono" name="min_nights" type="number" min={1} max={60} defaultValue={p?.min_nights ?? 2} /></label>
          <label className="field"><span>Maximum nights</span><input className="input mono" name="max_nights" type="number" min={1} max={365} defaultValue={p?.max_nights ?? 30} /></label>
          <label className="field"><span>How guests book</span>
            <select className="input" name="booking_mode" defaultValue={p?.booking_mode || "instant"}>
              <option value="instant">Instant booking (confirmed right away)</option>
              <option value="request">Request to book (you accept or decline)</option>
            </select>
          </label>
          <label className="field"><span>Cancellation policy</span>
            <select className="input" name="cancellation_policy" defaultValue={p?.cancellation_policy || "moderate"}>{Object.entries(CANCELLATION).map(([k, v]) => <option key={k} value={k}>{v.label}: {v.text}</option>)}</select>
          </label>
          <label className="field"><span>Check-in from</span><input className="input" name="check_in_time" defaultValue={p?.check_in_time || "3:00 pm"} /></label>
          <label className="field"><span>Check-out by</span><input className="input" name="check_out_time" defaultValue={p?.check_out_time || "11:00 am"} /></label>
        </div>
      </div>

      <div className="box">
        <h2>Amenities</h2>
        <div className="check-grid">
          {Object.entries(AMENITIES).map(([k, v]) => <label className="chk" key={k}><input type="checkbox" name="amenities" value={k} defaultChecked={p?.amenities.includes(k)} />{v}</label>)}
        </div>
      </div>

      <div className="box">
        <h2>Rules and arrival</h2>
        <label className="field"><span>House rules (one per line)</span><textarea className="input" name="house_rules" defaultValue={p?.house_rules.join("\n")} placeholder={"No parties or events\nQuiet hours 10 pm – 8 am\nNo smoking"} /></label>
        <label className="field"><span>Arrival instructions <span className="muted" style={{ fontWeight: 400 }}>(only shared after a booking is confirmed)</span></span><textarea className="input" name="arrival_instructions" defaultValue={p?.arrival_instructions} placeholder="Door code, parking, Wi-Fi password, who to call…" /></label>
      </div>
      <div className="row"><SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton></div>
    </ActionForm>
  );
}

import { ActionForm, SubmitButton } from "./forms.tsx";
import { setGuestNameAction } from "@/app/actions/channel.ts";

export const NO_GUEST_NAME = "Guest name unavailable";

/**
 * The guest's name on a reservation from another site, with a small form to type it in (or correct it).
 * A name typed here is kept when the site's calendar refreshes.
 */
export function GuestNameCell({ id, name, source, site }: { id: string; name: string; source: string; site: string }) {
  return (
    <div className="gn">
      {name ? <b className="gn-name">{name}</b> : <span className="gn-none">{NO_GUEST_NAME}</span>}
      {name && <div className="hint">{source === "manual" ? "Entered by hand" : source === "import" ? "From payout file" : `From ${site}`}</div>}
      <details className="gn-edit">
        <summary className="linkbtn">{name ? "Edit name" : "Add guest name"}</summary>
        <ActionForm action={setGuestNameAction} className="stack gn-form">
          <input type="hidden" name="id" value={id} />
          <label className="sr-only" htmlFor={`gn-${id}`}>Guest full name</label>
          <input id={`gn-${id}`} className="input" name="guest_name" defaultValue={name} placeholder="Guest full name" autoComplete="off" maxLength={80} />
          <SubmitButton className="btn btn-primary btn-sm" pendingText="Saving…">Save name</SubmitButton>
          <small className="hint">Kept when the {site} calendar refreshes.</small>
        </ActionForm>
      </details>
    </div>
  );
}

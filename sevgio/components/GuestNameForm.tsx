import { ActionForm, SubmitButton } from "./forms.tsx";
import { Badge } from "./Badge.tsx";
import { saveStayDetailsAction } from "@/app/actions/channel.ts";

export const NO_GUEST_NAME = "Guest name unavailable";

/** What each site's calendar link can carry, to explain a missing reference or guest name in one short line. */
export function missingWhy(channel: string, site: string, missing: { ref: boolean; name: boolean }): string {
  if (channel === "bookingcom") return "Booking.com's calendar link never sends these.";
  if (channel === "airbnb") return missing.ref ? "Airbnb's calendar link sent no code for this stay, and never sends names." : "Airbnb's calendar link never sends guest names.";
  if (channel === "vrbo") return "Vrbo's calendar link didn't send " + (missing.ref && missing.name ? "these." : missing.ref ? "a reference." : "a name.");
  return `${site}'s calendar link didn't send ${missing.ref && missing.name ? "these" : missing.ref ? "a reference" : "a name"}.`;
}

/** The guest's name (or that it's unavailable), where it came from, and the phone's last digits when the site sent them. */
export function GuestCell({ name, source, site, phone }: { name: string; source: string; site: string; phone?: string }) {
  return (
    <div className="gn">
      {name ? <b className="gn-name">{name}</b> : <span className="gn-none">{NO_GUEST_NAME}</span>}
      {name && <div className="hint">{source === "manual" ? "Entered by hand" : source === "import" ? "From payout file" : `From ${site}`}</div>}
      {phone && <div className="hint">Phone ends in {phone}</div>}
    </div>
  );
}

/**
 * Whether a reservation from another site has its booking reference and guest name. When something is missing it says what,
 * why (what that site's calendar link sends), and offers a form to type it in; typed details are kept when the calendars refresh.
 */
export function DetailsCell({ id, channel, site, name, refCode }: { id: string; channel: string; site: string; name: string; refCode: string }) {
  const missing = { ref: !refCode, name: !name };
  const list = [missing.ref && "reference", missing.name && "guest name"].filter(Boolean).join(" and ");
  return (
    <div className="dt">
      {list ? <Badge tone="warn" icon="warn">Missing {list}</Badge> : <Badge tone="ok" icon="check">Complete</Badge>}
      {list && <p className="hint dt-why">{missingWhy(channel, site, missing)}</p>}
      <details className="gn-edit">
        <summary className="linkbtn">{list ? "Add details" : "Edit details"}</summary>
        <ActionForm action={saveStayDetailsAction} className="stack gn-form">
          <input type="hidden" name="id" value={id} />
          <label className="field"><span>Guest full name</span><input className="input" name="guest_name" defaultValue={name} autoComplete="off" maxLength={80} /></label>
          <label className="field"><span>{site} reference</span><input className="input mono" name="ref" defaultValue={refCode} autoComplete="off" maxLength={40} placeholder={channel === "airbnb" ? "HMABC12345" : channel === "bookingcom" ? "4512345678" : ""} /></label>
          <SubmitButton className="btn btn-primary btn-sm" pendingText="Saving…">Save details</SubmitButton>
          <small className="hint">Copy them from the reservation on {site}. Kept when the {site} calendar refreshes.</small>
        </ActionForm>
      </details>
    </div>
  );
}

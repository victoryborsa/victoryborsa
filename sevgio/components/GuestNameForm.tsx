import { ActionForm, SubmitButton } from "./forms.tsx";
import { Badge } from "./Badge.tsx";
import { saveStayDetailsAction, setKindAction } from "@/app/actions/channel.ts";
import { EXTERNAL_NOTES_EDITABLE } from "@/lib/reservation-rules.ts";

/** A period a site's calendar link shows as unavailable without saying whether a guest booked it (Booking.com "CLOSED - Not available"). */
export const CAL_BLOCK = "External Calendar Block";
/** What shows instead of a guest name the site's calendar link didn't send. Not an error: calendar links carry dates, not guests. */
export const noName = (site: string) => `Not provided by ${site}`;

/** What each site's calendar link can carry, to explain a missing reference or guest name in one short line. */
export function missingWhy(channel: string, site: string, missing: { ref: boolean; name: boolean }): string {
  if (channel === "bookingcom") return "Booking.com's calendar link never sends these.";
  if (channel === "airbnb") return missing.ref ? "Airbnb's calendar link sent no code for this stay, and never sends names." : "Airbnb's calendar link never sends guest names.";
  if (channel === "vrbo") return "Vrbo's calendar link didn't send " + (missing.ref && missing.name ? "these." : missing.ref ? "a reference." : "a name.");
  return `${site}'s calendar link didn't send ${missing.ref && missing.name ? "these" : missing.ref ? "a reference" : "a name"}.`;
}

/** The guest's name (or that the site didn't send one), where it came from, and the phone's last digits when the site sent them. */
export function GuestCell({ name, source, site, phone, block }: { name: string; source: string; site: string; phone?: string; block?: boolean }) {
  return (
    <div className="gn">
      {name ? <b className="gn-name">{name}</b> : block ? <span className="gn-none">No guest details</span> : <span className="gn-none">{noName(site)}</span>}
      {name && <div className="hint">{source === "manual" ? "Entered by hand" : source === "import" ? "From payout file" : `From ${site}`}</div>}
      {phone && <div className="hint">Phone ends in {phone}</div>}
    </div>
  );
}

/**
 * Whether a reservation from another site has its booking reference and guest name. Calendar links never send some of these,
 * so a gap is shown as information, not an error, with a form to type them in (kept when the calendars refresh).
 * For an external calendar block, adding a name or reference turns it into a Confirmed reservation.
 */
export function DetailsCell({ id, channel, site, name, refCode, block }: { id: string; channel: string; site: string; name: string; refCode: string; block?: boolean }) {
  const missing = { ref: !refCode, name: !name };
  const list = [missing.ref && "reference", missing.name && "guest name"].filter(Boolean).join(" and ");
  return (
    <div className="dt">
      {block ? <span className="hint">Dates only, from the {site} calendar link.</span>
        : list ? <><Badge tone="neutral" icon="info">Calendar details only</Badge><p className="hint dt-why">{missingWhy(channel, site, missing)}</p></>
        : <Badge tone="ok" icon="check">Complete</Badge>}
      {EXTERNAL_NOTES_EDITABLE && <details className="gn-edit">
        <summary className="linkbtn">{block ? "Add reservation details" : list ? "Add details" : "Edit details"}</summary>
        <ActionForm action={saveStayDetailsAction} className="stack gn-form">
          <input type="hidden" name="id" value={id} />
          <label className="field"><span>Guest full name</span><input className="input" name="guest_name" defaultValue={name} autoComplete="off" maxLength={80} /></label>
          <label className="field"><span>{site} reference</span><input className="input mono" name="ref" defaultValue={refCode} autoComplete="off" maxLength={40} placeholder={channel === "airbnb" ? "HMABC12345" : channel === "bookingcom" ? "4512345678" : ""} /></label>
          <SubmitButton className="btn btn-primary btn-sm" pendingText="Saving…">Save details</SubmitButton>
          <small className="hint">Copy them from the reservation on {site}. Kept when the {site} calendar refreshes.{block ? " Saving marks these dates as a confirmed reservation." : ""}</small>
        </ActionForm>
      </details>}
    </div>
  );
}

/**
 * The status of an external calendar block: the site shows the dates as unavailable without saying whether a guest booked them.
 * It turns into "Confirmed on {site}" by itself when a reservations or payout file, or details typed in, match it.
 * Hosts who know what it is can say so, tucked away so the row stays calm.
 */
export function BlockStatus({ id, site, summary, back }: { id: string; site: string; summary: string; back: string }) {
  return (
    <div className="bk-check">
      <Badge tone="neutral" icon="info">{CAL_BLOCK}</Badge>
      <p className="hint">{site} shows these dates as “{summary || "unavailable"}”. Read-only: it turns Confirmed by itself when a matching reservations or payout file is imported.</p>
      {false && <details className="bk-sort">
        <summary className="linkbtn">Know what it is?</summary>
        <div className="bk-check-actions">
          {([["reservation", "It's a guest reservation"], ["blocked", "It's dates I closed"]] as const).map(([k, text]) => (
            <form key={k} action={setKindAction}>
              <input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="kind" value={k} />
              <button className="btn btn-ghost btn-sm">{text}</button>
            </form>
          ))}
        </div>
      </details>}
    </div>
  );
}

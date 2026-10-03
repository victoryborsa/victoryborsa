import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth.ts";
import { propertyBySlug, photosFor, photoUrl } from "@/lib/queries.ts";
import { isRangeFree, stayProblem } from "@/lib/bookings.ts";
import { getSettings } from "@/lib/settings.ts";
import { fmtDate } from "@/lib/dates.ts";
import { baseLabel, quote } from "@/lib/pricing.ts";
import { demandBetween } from "@/lib/demand.ts";
import { money } from "@/lib/money.ts";
import { CANCELLATION, FLIGHT_SERVICES } from "@/lib/constants.ts";
import { partyFromParams, partyLabel } from "@/lib/party.ts";
import { arrivalOptions } from "@/lib/arrival.ts";
import { enabledMethods, forListing } from "@/lib/payments.ts";
import { PaymentChoice } from "@/components/PaymentChoice.tsx";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { createBookingAction } from "@/app/actions/bookings.ts";
import { resendCodeAction, verifyCodeAction } from "@/app/actions/auth.ts";
import { verificationRequired } from "@/lib/email.ts";

export const metadata: Metadata = { title: "Confirm your booking", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BookPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ci = sp.ci || "", co = sp.co || "", party = partyFromParams(sp);
  const qs = new URLSearchParams({ ci, co, adults: String(party.adults), children: String(party.children), infants: String(party.free_children), ...(party.pets ? { pets: String(party.pets) } : {}), ...(party.services?.length ? { svc: party.services.join(",") } : {}) });
  const back = `/stays/${slug}?${qs}`;
  const u = await requireUser(undefined, `/book/${slug}?${qs}`);
  const p = await propertyBySlug(slug);
  if (!p || p.status !== "published") notFound();
  // Long-term leases are requested or applied for on the property page, not booked by date.
  if (p.corp_lease_only) redirect(`/stays/${p.slug}`);
  const problem = stayProblem(p, ci, co, party) || (!(await isRangeFree(p.id, ci, co)) ? "Some of these nights were just booked. Please choose different dates." : null);
  if (problem) {
    return (
      <div className="wrap page-pad">
        <div className="empty"><h2>These dates don't work</h2><p className="muted">{problem}</p><Link className="btn btn-primary" href={back}>Choose different dates</Link></div>
      </div>
    );
  }
  if (!ci) redirect(back);
  const [site, photos] = await Promise.all([getSettings(), photosFor(p.id)]);
  const settings = forListing(site, p);
  if (p.smart_pricing) p.demand = await demandBetween(ci, co);
  const pr = quote(p, ci, co, settings.tax_percent, party);
  const methods = enabledMethods(settings);
  const instant = p.booking_mode === "instant";

  return (
    <div className="wrap">
      <div className="crumbs"><Link href={back}>← Back to {p.title}</Link></div>
      <h1 style={{ fontSize: "clamp(26px,4vw,36px)", marginBottom: 18 }}>{instant ? "Confirm your booking" : "Request to book"}</h1>
      <ol className="steps">
        <li className="done"><span className="n">✓</span>Choose dates</li>
        <li className="now"><span className="n">2</span>Your details</li>
        <li><span className="n">3</span>{instant ? "Confirmed" : "Host replies"}</li>
      </ol>
      <div className="checkout-grid" style={{ paddingTop: 0 }}>
        {!u.verified && verificationRequired() ? (
          <div className="box">
            <h2>Confirm your email</h2>
            <p>To keep bookings genuine, we sent a 6-digit code to <b>{u.email}</b>. Enter it below to continue. Your dates are saved.</p>
            <ActionForm action={verifyCodeAction} className="stack">
              <input type="hidden" name="next" value={`/book/${slug}?${qs}`} />
              <label className="field" style={{ maxWidth: 220 }}><span>6-digit code</span><input className="input mono" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} style={{ fontSize: 22, letterSpacing: ".2em" }} /></label>
              <div><SubmitButton pendingText="Checking…">Confirm email</SubmitButton></div>
            </ActionForm>
            <ActionForm action={resendCodeAction} className="row">
              <span className="hint">No email? Check your spam folder, or</span>
              <SubmitButton className="linkbtn" pendingText="Sending…">send a new code</SubmitButton>
            </ActionForm>
            <p className="hint">Wrong email? <Link href="/account">Change it in your account</Link>.</p>
          </div>
        ) : (
        <ActionForm action={createBookingAction} className="box">
          <h2>Who's staying?</h2>
          <div className="notice ok">Signed in as <b>{u.email}</b>. We'll send your confirmation there.</div>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="ci" value={ci} />
          <input type="hidden" name="co" value={co} />
          <input type="hidden" name="adults" value={party.adults} />
          <input type="hidden" name="children" value={party.children} />
          <input type="hidden" name="infants" value={party.free_children} />
          <input type="hidden" name="pets" value={party.pets || 0} />
          <input type="hidden" name="svc" value={(party.services || []).join(",")} />
          <div className="grid-2">
            <label className="field"><span>Lead guest's full name</span><input className="input" name="name" autoComplete="name" defaultValue={u.name} required /></label>
            <label className="field"><span>Mobile phone</span><input className="input" name="phone" type="tel" autoComplete="tel" defaultValue={u.phone} required /><span className="hint">For the host to reach you during your stay</span></label>
          </div>
          <label className="field"><span>Estimated arrival time <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></span>
            <select className="input" name="arrival" defaultValue="">
              <option value="">I don't know yet</option>
              {arrivalOptions(p.check_in_time).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <span className="hint">Check-in is from {p.check_in_time}. Letting the host know helps them get ready for you.</span>
          </label>
          {pr.extras.filter(x => x.key in FLIGHT_SERVICES).map(x => (
            <fieldset key={x.key} className="flight-box">
              <legend>{x.name}: your flight</legend>
              <div className="grid-3">
                <label className="field"><span>Date</span><input className="input" type="date" name={`fl_${x.key}_date`} defaultValue={FLIGHT_SERVICES[x.key].when === "ci" ? ci : co} required /></label>
                <label className="field"><span>{FLIGHT_SERVICES[x.key].timeLabel}</span><input className="input" type="time" name={`fl_${x.key}_time`} required /></label>
                <label className="field"><span>Airline and flight number</span><input className="input" name={`fl_${x.key}_flight`} placeholder="Delta DL 1234" maxLength={60} required /></label>
              </div>
            </fieldset>
          ))}
          <label className="field">
            <span>{instant ? <>Note for the host <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></> : "Message to the host"}</span>
            <textarea className="input" name="message" placeholder={instant ? "Anything the host should know?" : "Say hello and tell the host a little about your trip."} />
          </label>
          {methods.length ? <PaymentChoice methods={methods} total={pr.total} s={settings} request={!instant} /> : <div className="notice info">{settings.payment_note}</div>}
          <p style={{ fontSize: 14 }}><b>Cancellation:</b> {CANCELLATION[p.cancellation_policy]?.text}</p>
          <label className="chk"><input type="checkbox" name="agree" /> I agree to the house rules and cancellation policy.</label>
          <div><SubmitButton pendingText={instant ? "Booking…" : "Sending…"}>{!instant ? "Send request" : methods.length ? "Book and pay" : `Confirm booking · ${money(pr.total)}`}</SubmitButton></div>
        </ActionForm>
        )}

        <aside className="box" style={{ alignSelf: "start" }}>
          <div className="mini">
            <div className="ph">{photos[0] ? <img src={photoUrl(photos[0].id, "thumb")} alt="" /> : <div className="noph" style={{ minHeight: 0 }} />}</div>
            <div><strong>{p.title}</strong><div className="muted" style={{ fontSize: 14 }}>{p.city} · {instant ? "Instant booking" : "Request to book"}</div></div>
          </div>
          <dl className="kv">
            <dt>Check-in</dt><dd>{fmtDate(ci)}, after {p.check_in_time}</dd>
            <dt>Check-out</dt><dd>{fmtDate(co)}, before {p.check_out_time}</dd>
            <dt>Guests</dt><dd>{partyLabel(party)}</dd>
          </dl>
          <table className="breakdown">
            <tbody>
              <tr><td>{baseLabel(pr, money, p)}{pr.smart && <div className="hint">Nightly prices follow demand in Pittsburgh</div>}</td><td>{money(pr.base)}</td></tr>
              {pr.discount > 0 && <tr><td>{pr.discountLabel}</td><td>−{money(pr.discount)}</td></tr>}
              {pr.cleaning > 0 && <tr><td>Cleaning fee</td><td>{money(pr.cleaning)}</td></tr>}
              {pr.petFee > 0 && <tr><td>Pet fee ({pr.pets} pet{pr.pets === 1 ? "" : "s"})</td><td>{money(pr.petFee)}</td></tr>}
              {pr.extras.map(x => <tr key={x.key}><td>{x.name}{x.qty > 1 && x.total ? ` × ${x.qty}` : ""}</td><td>{x.total ? money(x.total) : "Free"}</td></tr>)}
              {settings.tax_percent > 0 && <tr><td>Taxes ({settings.tax_percent}%)</td><td>{money(pr.tax)}</td></tr>}
              <tr className="total"><td>Total</td><td>{money(pr.total)}</td></tr>
            </tbody>
          </table>
          <Link href={back} className="btn btn-ghost btn-sm" style={{ alignSelf: "start" }}>Change dates</Link>
        </aside>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth.ts";
import { propertyBySlug, photosFor, photoUrl } from "@/lib/queries.ts";
import { isRangeFree, stayProblem } from "@/lib/bookings.ts";
import { getSettings } from "@/lib/settings.ts";
import { fmtDate } from "@/lib/dates.ts";
import { quote } from "@/lib/pricing.ts";
import { money } from "@/lib/money.ts";
import { CANCELLATION } from "@/lib/constants.ts";
import { ActionForm, SubmitButton } from "@/components/forms.tsx";
import { createBookingAction } from "@/app/actions/bookings.ts";

export const metadata: Metadata = { title: "Confirm your booking", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BookPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ci = sp.ci || "", co = sp.co || "", guests = Number(sp.guests) || 1;
  const back = `/stays/${slug}?` + new URLSearchParams({ ci, co, guests: String(guests) });
  const u = await requireUser(undefined, `/book/${slug}?` + new URLSearchParams({ ci, co, guests: String(guests) }));
  const p = await propertyBySlug(slug);
  if (!p || p.status !== "published") notFound();
  const problem = stayProblem(p, ci, co, guests) || (!(await isRangeFree(p.id, ci, co)) ? "Some of these nights were just booked. Please choose different dates." : null);
  if (problem) {
    return (
      <div className="wrap page-pad">
        <div className="empty"><h2>These dates don't work</h2><p className="muted">{problem}</p><Link className="btn btn-primary" href={back}>Choose different dates</Link></div>
      </div>
    );
  }
  if (!ci) redirect(back);
  const [settings, photos] = await Promise.all([getSettings(), photosFor(p.id)]);
  const pr = quote(p, ci, co, settings.tax_percent);
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
        <ActionForm action={createBookingAction} className="box">
          <h2>Who's staying?</h2>
          <div className="notice ok">Signed in as <b>{u.email}</b>. We'll send your confirmation there.</div>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="ci" value={ci} />
          <input type="hidden" name="co" value={co} />
          <input type="hidden" name="guests" value={guests} />
          <div className="grid-2">
            <label className="field"><span>Lead guest's full name</span><input className="input" name="name" autoComplete="name" defaultValue={u.name} required /></label>
            <label className="field"><span>Mobile phone</span><input className="input" name="phone" type="tel" autoComplete="tel" defaultValue={u.phone} required /><span className="hint">For the host to reach you during your stay</span></label>
          </div>
          <label className="field"><span>Estimated arrival time <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></span><input className="input" name="arrival" placeholder="e.g. around 5 pm" /></label>
          <label className="field">
            <span>{instant ? <>Note for the host <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></> : "Message to the host"}</span>
            <textarea className="input" name="message" placeholder={instant ? "Anything the host should know?" : "Say hello and tell the host a little about your trip."} />
          </label>
          <div className="notice info">{settings.payment_note}</div>
          <p style={{ fontSize: 14 }}><b>Cancellation:</b> {CANCELLATION[p.cancellation_policy]?.text}</p>
          <label className="chk"><input type="checkbox" name="agree" /> I agree to the house rules and cancellation policy.</label>
          <div><SubmitButton pendingText={instant ? "Booking…" : "Sending…"}>{instant ? `Confirm booking · ${money(pr.total)}` : "Send request"}</SubmitButton></div>
        </ActionForm>

        <aside className="box" style={{ alignSelf: "start" }}>
          <div className="mini">
            <div className="ph">{photos[0] ? <img src={photoUrl(photos[0].id, "thumb")} alt="" /> : <div className="noph" style={{ minHeight: 0 }} />}</div>
            <div><strong>{p.title}</strong><div className="muted" style={{ fontSize: 14 }}>{p.city} · {instant ? "Instant booking" : "Request to book"}</div></div>
          </div>
          <dl className="kv">
            <dt>Check-in</dt><dd>{fmtDate(ci)}, after {p.check_in_time}</dd>
            <dt>Check-out</dt><dd>{fmtDate(co)}, before {p.check_out_time}</dd>
            <dt>Guests</dt><dd>{guests}</dd>
          </dl>
          <table className="breakdown">
            <tbody>
              <tr><td>{money(pr.nightly)} × {pr.nights} nights</td><td>{money(pr.base)}</td></tr>
              {pr.cleaning > 0 && <tr><td>Cleaning fee</td><td>{money(pr.cleaning)}</td></tr>}
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

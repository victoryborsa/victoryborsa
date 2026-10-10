import Link from "next/link";

/** Shown when a password link is expired, used, or got cut short by a mail app. */
export function LinkProblem() {
  return (
    <div className="wrap">
      <div className="auth box">
        <h1 style={{ fontSize: 28 }}>This link doesn't work anymore</h1>
        <p className="muted">Password links work once and expire after 30 minutes (invitation links after 7 days). Ask for a new one below and use the link in the newest email.</p>
        <Link className="btn btn-primary btn-block" href="/forgot">Send me a new link</Link>
        <p className="hint">Still stuck? <Link href="/contact">Contact us</Link> and we'll set it up for you.</p>
      </div>
    </div>
  );
}

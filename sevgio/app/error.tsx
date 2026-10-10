"use client";
import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="wrap page-pad">
      <div className="empty">
        <h2>Something went wrong on our side</h2>
        <p className="muted" style={{ maxWidth: "46ch" }}>The problem has been logged. Try again, and if it keeps happening, contact us{error.digest ? ` and mention code ${error.digest}` : ""}.</p>
        <div className="row" style={{ justifyContent: "center" }}><button className="btn btn-primary" onClick={reset}>Try again</button><Link className="btn btn-ghost" href="/">Homepage</Link></div>
      </div>
    </div>
  );
}

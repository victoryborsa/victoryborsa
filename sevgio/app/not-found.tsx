import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap page-pad">
      <div className="empty">
        <h1 className="h-like-2">We couldn't find that page</h1>
        <p className="muted">The link may be old, or the listing may have been removed.</p>
        <div className="row" style={{ justifyContent: "center" }}><Link className="btn btn-primary" href="/stays">Browse stays</Link><Link className="btn btn-ghost" href="/">Homepage</Link></div>
      </div>
    </div>
  );
}

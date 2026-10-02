import Link from "next/link";
import { currentUser } from "@/lib/auth.ts";

export default async function NoAccess() {
  const u = await currentUser();
  return (
    <div className="wrap page-pad">
      <div className="empty">
        <h1 className="h-like-2">You don't have access to this page</h1>
        <p className="muted" style={{ maxWidth: "48ch" }}>{u ? `You're signed in as ${u.email}, which is a ${u.role} account. ` : ""}This area is for hosts or administrators only. If you think this is a mistake, contact an administrator.</p>
        <Link className="btn btn-primary" href="/">Go to the homepage</Link>
      </div>
    </div>
  );
}

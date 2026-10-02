"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

type Item = { href: string; label: string };

/**
 * Phones and tablets: a labelled "Menu" button opens a full-width panel that lists every link as a big row,
 * so nobody has to discover a sideways-scrolling strip. Computers keep the one-line menu.
 */
export function MobileMenu({ explore, account, signedIn, signOut, labels }: {
  explore: Item[];
  account: Item[];
  signedIn: boolean;
  signOut: () => Promise<void>;
  labels: { menu: string; close: string; explore: string; account: string; signout: string; signin: string; signup: string };
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const id = useId();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    // The panel opens right under the top bar, whatever its height.
    const bar = document.querySelector("header.site")?.getBoundingClientRect().bottom;
    if (bar) document.documentElement.style.setProperty("--mm-top", `${Math.round(bar)}px`);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [open]);
  const row = (it: Item) => {
    const here = path === it.href || (it.href !== "/" && path.startsWith(it.href + "/"));
    return <li key={it.href}><Link href={it.href} className="mm-link" aria-current={here ? "page" : undefined} onClick={() => setOpen(false)}>{it.label}<span aria-hidden>›</span></Link></li>;
  };
  return (
    <div className="mm">
      <button type="button" className={`mm-toggle${open ? " open" : ""}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="mm-bars" aria-hidden><i /><i /><i /></span>
        {open ? labels.close : labels.menu}
      </button>
      {open && (
        <div className="mm-back" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <nav id={id} className="mm-panel" aria-label={labels.menu}>
            <p className="mm-head">{labels.explore}</p>
            <ul>{explore.map(row)}</ul>
            {signedIn ? (
              <>
                <p className="mm-head">{labels.account}</p>
                <ul>{account.map(row)}</ul>
                <form action={signOut}><button type="submit" className="btn btn-ghost btn-block mm-out">{labels.signout}</button></form>
              </>
            ) : (
              <div className="mm-auth">
                <Link className="btn btn-ghost" href="/signin" onClick={() => setOpen(false)}>{labels.signin}</Link>
                <Link className="btn btn-primary" href="/signup" onClick={() => setOpen(false)}>{labels.signup}</Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type Item = { href: string; label: string };
const hostView = (path: string) => path === "/host" || path.startsWith("/host/") || path === "/admin" || path.startsWith("/admin/");

/**
 * "Become a host" (travelers), "Switch to hosting" (hosts and admins on the traveler side) or
 * "Switch to traveling" (on the host and admin pages). Always visible beside the ☰ menu.
 */
export function HostSwitch({ role, labels }: { role: string | null; labels: { become: string; toHosting: string; toTraveling: string } }) {
  const path = usePathname();
  if (hostView(path)) return <Link className="hs-btn" href="/">{labels.toTraveling}</Link>;
  if (role === "host" || role === "admin") return <Link className="hs-btn" href={role === "admin" ? "/admin" : "/host"}>{labels.toHosting}</Link>;
  return <Link className="hs-btn" href={role ? "/account#become-host" : "/signup?host=1"}>{labels.become}</Link>;
}

/**
 * The ☰ menu in the top-right corner: Contact, Admin (administrators only), My trips, Account and Sign out.
 * On phones and tablets it also lists the main pages. It closes when an option is picked, on a click
 * outside it, on Escape, and when the page changes.
 */
export function UserMenu({ main, items, signedIn, initial, signOut, labels }: {
  main: Item[];
  items: Item[];
  signedIn: boolean;
  initial: string;
  signOut: () => Promise<void>;
  labels: { menu: string; signout: string; signin: string; signup: string };
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close as EventListener);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close as EventListener); document.removeEventListener("keydown", close); };
  }, [open]);
  const row = (it: Item, cls = "") => {
    const here = path === it.href || (it.href !== "/" && path.startsWith(it.href + "/"));
    return <Link key={it.href} href={it.href} role="menuitem" className={`um-item ${cls}`} aria-current={here ? "page" : undefined} onClick={() => setOpen(false)}>{it.label}</Link>;
  };
  return (
    <div className="um" ref={box}>
      <button type="button" className={`um-btn${open ? " open" : ""}`} aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-label={labels.menu} onClick={() => setOpen(!open)}>
        <svg className="um-bars" viewBox="0 0 24 24" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        <span className={`um-avatar${signedIn ? " in" : ""}`} aria-hidden>{signedIn ? initial : <svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="4" /><path d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></svg>}</span>
      </button>
      {open && (
        <div className="um-pop" id={id} role="menu" aria-label={labels.menu}>
          <div className="um-main">{main.map(it => row(it))}<hr /></div>
          {!signedIn && <>{row({ href: "/signin", label: labels.signin }, "um-strong")}{row({ href: "/signup", label: labels.signup })}<hr /></>}
          {items.map(it => row(it))}
          {signedIn && (
            <>
              <hr />
              <form action={signOut} onSubmit={() => setOpen(false)}><button type="submit" role="menuitem" className="um-item">{labels.signout}</button></form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

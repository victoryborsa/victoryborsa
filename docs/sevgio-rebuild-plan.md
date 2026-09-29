# Sevgio.com Rebuild — Pre-Development Plan

Status: **Draft for approval.** No development has started. The audit (project steps 1–2) is blocked. See "Blockers" below.

## 1. Discovery status and blockers

| Item | Status |
|---|---|
| Sevgio.com source code | **Not found.** This repository (`victoryborsa/victoryborsa`) only contains a GitHub profile README. The other repos on the account (`Swing`, `Swing-trade-alerts`) are unrelated trading projects. |
| Live site (sevgio.com) | **Not reachable** from the build environment because the network policy blocks it. |
| Reference site (booking.onefinebnb.com) | **Not reachable** for the same reason. |
| Database, hosting, integrations, error logs | **No access yet.** |

Until these are resolved, I can't say what is causing the slowness and errors. Any audit written now would be a guess, so this plan leaves the audit sections open.

### What's needed to finish the audit

1. **Where the site runs.** Is it custom code (which language and framework?), WordPress with a booking plugin, or a hosted platform such as Guesty, Hostaway, Lodgify, OwnerRez or Hostfully?
2. **Code access.** Either push the code to a GitHub repo and connect it to this session, or send an export.
3. **Hosting and database access** (read-only is fine for the audit): the hosting provider, a database dump or schema, and server and error logs from the last 30 days.
4. **Integrations list:** payments (Stripe, PayPal, …), channel managers or calendar syncs (Airbnb/Vrbo iCal or API), email/SMS provider, maps, analytics, reviews.
5. **Known errors:** what guests, hosts and admins see, how often, and on which pages.
6. **Network access:** add `sevgio.com` and `booking.onefinebnb.com` to the allowed domains so the live site can be measured (page weight, load times, broken requests) and the reference layout can be studied.

### Reference site notes (from search results, since direct access is blocked)

- `booking.onefinebnb.com` is One Fine BnB's direct-booking site, separate from its marketing site `onefinebnb.com`.
- Search takes location, check-in/check-out dates and guest count. Filters cover amenities such as air conditioning, pool and pet-friendly.
- Listing URLs look like `/listings/158663`. Numeric IDs like that are the URL pattern of a PMS-hosted booking website (this looks like Hostaway's, but that is **inferred and not confirmed**). In other words, the reference site is most likely a stock PMS booking site with a custom theme, not custom-built.
- **What this means for Sevgio:** if Sevgio already uses a PMS, or would adopt one, a similar result is possible either through that PMS's built-in booking site or through a faster custom front end on its API. This supports Option A in Section 3.

## 2. How the audit will be done (once access is granted)

- **Front end:** measure page weight, Core Web Vitals (LCP, INP, CLS) on mobile and desktop, unoptimized images, render-blocking scripts, and third-party script cost.
- **Back end:** find slow endpoints and database queries (missing indexes, N+1 queries, availability being computed on every request), check caching, and review error logs grouped by cause.
- **Booking integrity:** check how availability is locked during checkout and whether double bookings or race conditions are possible, check calendar sync lag, and check whether payment webhooks are handled idempotently.
- **Security:** review how passwords are stored, session handling, and role checks on every host/admin endpoint (including tampering with an ID to reach another host's listing), plus dependency and plugin versions.
- **Output:** a 1–2 page audit that lists each cause, its evidence, its impact, and the fix.

## 3. Retain vs. rebuild — decision framework

This will be confirmed after the audit. It depends on what the current system is.

| Area | Default recommendation | Keep it if… |
|---|---|---|
| Property data (listings, photos, amenities, rules) | **Migrate** into the new schema | Always. This is core business data. |
| Customer / host accounts | **Migrate**, with password hashes carried over if the algorithm is secure; otherwise send reset emails | Always, if the data is clean |
| Reservations: past and upcoming | **Migrate**, with a reconciliation report (counts, totals, dates checked against the source) | Always |
| Payment provider (e.g. Stripe) | **Keep the account** and rebuild the integration code | The provider works and fees are acceptable |
| Channel manager / PMS (if any) | **Keep and integrate.** It should stay the source of truth for availability | It's reliable. Rebuilding a PMS is out of scope. |
| Calendar sync (iCal) | Rebuild with frequent sync plus a lock at booking time | — |
| Email/SMS provider | Keep the account and rebuild the templates | It delivers reliably |
| Front-end pages | **Rebuild** | — |
| Custom booking and auth code | **Rebuild** unless the audit shows it's sound | The audit finds it sound |

**Important:** if Sevgio currently runs on a hosted PMS such as Guesty or Hostaway, the rebuild should be a **fast custom front end on top of that PMS's API**. Rebuilding the whole booking back end would not make sense in that case. Scope, cost and timeline differ a lot between these two paths, which is why the audit comes first.

## 4. Proposed technical approach (for a full rebuild)

- **Framework:** Next.js (React) with server-side rendering and static generation for listing pages. Pages load fast and search engines can read them.
- **Database:** PostgreSQL. Double bookings are prevented **in the database itself** with an exclusion constraint on `(property_id, daterange)` for confirmed and held bookings, so the database refuses a second booking for the same property and dates even when two guests click Book at the same moment.
- **Checkout holds:** a short-lived hold (about 15 minutes) is placed on the dates when payment starts. The hold is released automatically if payment fails or the guest abandons checkout. Payment webhooks are processed idempotently, so a repeated notification can't create a second booking.
- **Images:** a CDN with automatic resizing and modern formats. Photos are the main cause of slow load times on rental sites.
- **Hosting:** managed hosting (e.g. Vercel, Render or Fly) plus managed Postgres with daily backups and point-in-time recovery. Staging and production are separate environments.
- **Monitoring:** error tracking (e.g. Sentry) plus a `booking_events` log table. Admins can see every failed booking action in the dashboard.

## 5. Page flow (for approval)

```
Home ── search (location, dates, guests) ──► Search results ──► Property detail
  │                                          (filters, sort,     (gallery, details,
  │                                           empty state)        calendar, price
  │                                                               breakdown)
  │                                                                   │
  └─ Contact                                                     Book / Request
                                                                      │
                                          Sign in / create account ◄──┤
                                                                      ▼
                                   Guest details ► Review & pay ► Confirmation
                                                                      │
                                           My account ◄───────────────┘
                                           (profile, reservations, status & next steps)

Host dashboard:  My properties ► Edit listing / photos / pricing / availability ► Reservations
Admin dashboard: Users & roles ► Properties ► Reservations ► Settings ► Error / failed-booking log
```

- **Book Now vs. Request to Book:** the site will keep whichever mode the current site uses. It could also be set per property, with a host approval step and an automatic expiry for requests.
- **Design:** an original Sevgio visual identity. The only ideas taken from the reference site are its layout principles: a search bar first, scannable cards, and a clearly sectioned detail page. Mockups will be delivered for approval before full development.

## 6. Access control (customer / host / admin)

- **Roles:** `customer`, `host`, `admin`, with an optional `support` role that can only read data. Admins assign roles; users can't change their own role.
- **Enforcement on the server, on every request.** Hiding buttons is not enough. Every host query is scoped by ownership, e.g. `WHERE property.host_id = current_user`. Postgres row-level security adds a second layer of protection.
- **Guest data minimization:** hosts see only the guest details needed for a stay, and only for reservations on their own properties.
- **Authentication:** passwords are stored with Argon2/bcrypt. Sign-in is rate-limited. Password reset links are single-use and expire. Sessions use secure cookies with CSRF protection. **Two-factor authentication is required for admins** and optional for hosts.
- **Payments:** card data never touches Sevgio servers, because the payment provider's hosted fields handle it (keeps the site PCI SAQ-A eligible).
- **Audit log:** every admin and host change to listings, prices, availability or roles is recorded (who, what, when).
- **Automated tests** check that each role is denied access to other users' resources.

## 7. Migration safety

1. Take a full backup of the current database and media before touching anything.
2. Rehearse the migration into staging and produce a reconciliation report (row counts, reservation totals, upcoming stays checked one by one).
3. Freeze bookings for a short cutover window, re-run the migration of recent changes, then switch DNS.
4. Keep the old site read-only for 30 days as a fallback.

## 8. Testing before launch

- End-to-end automated tests for the guest flow (search → book → pay → confirm → view reservation), the host flow (edit listing, block dates, manage reservation), and the admin flow (role changes, error log).
- Concurrency test: two simultaneous bookings for the same dates. Exactly one must succeed.
- Mobile/desktop performance budget: mobile LCP under 2.5 s on listing and search pages.
- Security checks: access-control tests for each role, dependency scan.

## 9. Decisions needed from you

1. Answers and access for Section 1 (the most important).
2. Instant booking, request to book, or a choice per property?
3. Payment provider and cancellation policies currently in use.
4. Do hosts need payout reports or statements in the dashboard?
5. Languages and currencies to support.

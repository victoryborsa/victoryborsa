# Sevgio

The booking website for Sevgio vacation rentals in Pennsylvania: guest search and booking, host dashboard, and admin dashboard.

- **Guests** search by town, dates and guests; see real-time availability and the full price; book instantly or send a request; manage their trips; reset their password.
- **Hosts** manage only their own listings: details, photos, pricing, blocked dates, Airbnb/Vrbo calendar sync, booking requests, and guest questions.
- **Admins** manage users and roles, all listings and bookings, site settings (tax, contact details, payment note), and see every error or failed booking in one log.

Online payment is intentionally off for now. Guests see a note (editable in Admin → Settings) saying the host arranges payment. See "Adding payments later" below.

## How it is built

| Part | Choice | Why |
|---|---|---|
| Website | Next.js 15 (React), server-rendered | Fast first load (≈106 KB of JavaScript), works on phones, good for Google |
| Database | PostgreSQL 14+ | Reliable; double bookings are blocked **by the database itself** |
| Photos | Stored in the database, resized to WebP on upload | Nothing extra to set up; photos are cached for a year by browsers |
| Sign-in | Email + password, bcrypt hashing, secure HTTP-only cookies | No third-party accounts needed |
| Email | Any SMTP provider (optional) | Without it, emails are printed to the server log |

### How double bookings are prevented

1. The calendar only lets guests pick free nights.
2. When a guest confirms, the server locks that listing, re-checks every booked night and every blocked night, then saves.
3. The database has an exclusion constraint (`bookings_no_overlap`) that refuses any two active bookings for the same listing on overlapping nights, even if the first two checks were somehow skipped.

The automated tests fire 20 simultaneous bookings at the same nights and confirm exactly one succeeds.

### How access is protected

- Every host and admin page, and every action behind it, checks the signed-in user's role on the server. Hiding a button is never the only protection.
- Hosts can only load or change listings and bookings where they are the host. Admins can manage everything.
- Guests' phone numbers and emails are shown to hosts only for active bookings on their own listings. The street address and arrival instructions are shown to guests only after a booking is confirmed.
- Passwords are hashed with bcrypt. Sessions are random tokens stored hashed. After 5 failed sign-ins for one email in 15 minutes, sign-in pauses.
- Password reset links are single-use and expire after 30 minutes. Changing a password or role signs that person out everywhere.
- Calendar import links can only reach public internet addresses.
- Security headers (HSTS, no framing, no sniffing) are set on every page.

## Run it on your computer

Requirements: Node.js 20+ and PostgreSQL 14+.

```bash
cd sevgio
cp .env.example .env              # then edit DATABASE_URL
npm install
npm run migrate                   # creates the tables
npm run create-admin -- "Your Name" you@example.com "a-long-password"
npm run seed:demo                 # optional: 6 sample Pennsylvania listings
npm run build && npm start        # http://localhost:3000
```

Remove the sample listings any time with `npm run seed:demo -- --remove`.

## Tests

```bash
DATABASE_URL=postgres://…/sevgio_test npm test     # booking engine: overlaps, blocks, pricing, calendars
npm run build && npm run test:e2e                  # browser tests of guest, host and admin workflows
```

The browser tests wipe and rebuild the test database set in `E2E_DATABASE_URL` (default `postgres://sevgio:sevgio@localhost:5432/sevgio_test`). Never point it at the live database.

## Going live (recommended: Render)

Render runs the website and the database together, with daily backups. The monthly cost for a small site is roughly the price of the web service plus the database plan you pick.

1. **Put the code on GitHub.** It is already in this repository under `sevgio/`.
2. **Create the database.** On [render.com](https://render.com): New → PostgreSQL. Choose a paid plan so you get backups. Copy the **Internal Database URL**.
3. **Create the website.** New → Web Service → connect this repository.
   - Root directory: `sevgio`
   - Build command: `npm ci && npm run build`
   - Pre-deploy command: `npm run migrate`
   - Start command: `npm start`
   - Environment variables: `DATABASE_URL` (from step 2), `SITE_URL=https://sevgio.com`, `CRON_SECRET` (any long random text), and the `SMTP_*` / `EMAIL_FROM` values for email.
4. **Create your admin account.** In the web service's Shell tab: `npm run create-admin -- "Your Name" you@example.com "a-long-password"`.
5. **Schedule calendar sync.** New → Cron Job, schedule `0 * * * *`, command:
   `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://sevgio.com/api/cron/sync-calendars`
   (set the same `CRON_SECRET` on the cron job). This imports Airbnb/Vrbo calendars hourly and expires unanswered requests.
6. **Test on Render's temporary address** (like `sevgio.onrender.com`) before switching the domain.

Vercel with a Neon or Supabase database also works: set the same environment variables, add `?sslmode=require` to the database URL, and run `npm run migrate` from your computer against the live database before the first deploy.

## Pointing sevgio.com at the new site (GoDaddy)

Do this only after the new site is tested.

1. In Render: your web service → Settings → Custom Domains → add `sevgio.com` and `www.sevgio.com`. Render shows the exact DNS records to use.
2. In GoDaddy: **My Products → sevgio.com → DNS**.
   - Change the `A` record for `@` to the IP address Render shows.
   - Change the `CNAME` record for `www` to the address Render shows (like `sevgio.onrender.com`).
   - **Don't touch `MX` or `TXT` email records**, so your @sevgio.com email keeps working.
3. Wait 5 minutes to a few hours. Render issues the HTTPS certificate automatically.
4. To go back to the old site, restore the old `A` and `CNAME` values.

## Email

Without email settings, new guests can't confirm their account (the 6-digit code never arrives) and nobody gets booking emails.

**With Gmail (sevgio.stays@gmail.com):**
1. At myaccount.google.com → Security, turn on 2-Step Verification.
2. Open myaccount.google.com/apppasswords, name it "Sevgio website" and click Create. Copy the 16-letter password.
3. In Render → the `sevgio` service → Environment, add `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=sevgio.stays@gmail.com`, `SMTP_PASS=<the 16 letters>` and `EMAIL_FROM=Sevgio <sevgio.stays@gmail.com>`, then Save, rebuild and deploy.
4. In Admin → Overview, click "Send me a test email".

Gmail can send about 500 emails a day, plenty for a small rental business. Admins can also confirm a guest's email by hand in Admin → Users.

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM`. Any provider works, for example:
- GoDaddy / Microsoft 365 email: host `smtp.office365.com`, port 587, your mailbox and password (SMTP sending must be enabled for the mailbox).
- Google Workspace: host `smtp.gmail.com`, port 587, an app password.
- A sending service such as Resend, Postmark or SendGrid (best delivery rates).

Emails sent: booking confirmations and requests (to guest and host), accept/decline/cancel notices, password resets, invitations, and contact-form messages (to the contact email in Admin → Settings).

## Managing the site day to day

- **Add a host:** Admin → Users & roles → Invite a host. They get an email to set their password. Or change an existing account's role.
- **Add a listing:** Host dashboard → Listings → Add a listing → upload photos → set Visibility to Published.
- **Block dates:** Listing → Calendar & sync → click the dates → Block these dates.
- **Sync with Airbnb/Vrbo:** Listing → Calendar & sync. Copy the Sevgio link into Airbnb/Vrbo, and paste their export link into Sevgio.
- **Answer requests:** Host dashboard → Overview. Unanswered requests expire after 48 hours and release the dates.
- **Check for problems:** Admin → Errors & activity. Failed emails, calendar imports, refused bookings and server errors appear here.
- **Taxes and notices:** Admin → Settings.
- **Whole house and rooms:** add the whole house first ("The whole place"), then each room ("A private room" → pick the house). Their calendars block each other automatically; rooms don't block each other.
- **Pricing per guest:** in each listing, set the base occupancy, extra guest fee, smaller-group discount, the age up to which children stay free, and weekly/monthly discounts.
- **Management fee:** admins set a % per listing (Admin → Listings → Edit → Management). It's taken from rent after discounts, not from cleaning or tax, and is saved on each booking so later changes don't alter past statements.
- **Statements:** Host dashboard or Admin → Finance. Pick a month and property to see the reservations statement (by check-in date), per-property occupancy and owner payouts, and a 12-month overview. "Download statement (CSV)" opens in Excel or Google Sheets.

## Payments

Turn options on in **Admin → Settings → Payments**. When at least one is on, bookings wait in **Awaiting payment** (the dates are held) and are cancelled automatically if not paid in time.

| Option | How it's confirmed | Fee |
|---|---|---|
| Card (Stripe Checkout) | Automatically, by Stripe's webhook | Card fee (default 2.9% + 30¢) is added to the guest's total |
| Bank transfer / ACH (Stripe) | Automatically; shows "processing" until it clears (about 4 business days) | 0.8%, max $5, paid by you |
| Zelle | You click "Mark payment received" in Bookings | Free |
| Venmo | You click "Mark payment received" | Free on personal; Venmo Business 1.9% + 10¢ |
| Cash at arrival | Deposit (default 30%) by Zelle/Venmo marked received; rest collected in cash | Free |

Request-to-book homes ask for payment after the host accepts.

### Setting up Stripe (for card and bank transfer)

1. Create an account at stripe.com and complete the business details and payout bank account.
2. **Developers → API keys**: copy the **Secret key** (`sk_live_…`, or `sk_test_…` to try it with test cards first).
3. **Developers → Webhooks → Add endpoint**: URL `https://sevgio.com/api/stripe/webhook` (or your onrender.com address before the domain switch). Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`. Copy the **Signing secret** (`whsec_…`).
4. For bank transfers: **Settings → Payment methods → ACH Direct Debit → Turn on**.
5. In Render → sevgio → Environment add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, then save and deploy.
6. In Admin → Settings, tick Card and/or Bank transfer.

Card surcharges: card-network rules cap surcharges at 3% and don't allow them on debit cards; keep the fee at or below your real cost and check with your accountant. Refunds are made in the Stripe dashboard.

## Moving data from the old site

When the old site's data is available (a database export or CSV of listings, guests and upcoming bookings), write a one-time import script into `scripts/` that inserts into the same tables. The database constraints will refuse any overlapping bookings, which also catches problems in the old data. Check the counts against the old system before switching the domain.

## Events page

`/events` shows Pittsburgh events by day, week or month, with filters for the Steelers, Pirates, Penguins and event types.

- **Ticketmaster** (games, concerts, shows): create a free account at developer.ticketmaster.com, open My Apps and copy the **Consumer Key**. Add it in Render → Environment as `TICKETMASTER_API_KEY`. Events within 25 miles of downtown for the next 4 months are pulled every 3 hours by the scheduled job (or with "Update events now" in Admin → Events).
- **Calendar links**: in Admin → Events, paste any public `.ics`/`webcal://` calendar (team schedules, venues).
- **Your own events**: add festivals and local events with a flyer in Admin → Events. Any event can be featured or hidden there.

# Developer Handoff — Shine Pro Cleaning Back Office (final)

Hi! This package adds lead capture, a verified AI website chat, owner alerts, and customer/employee/job management to **pghshinepro.com**.
It's a small, self-contained Node.js service. Run it on a subdomain next to the existing site, then paste the snippets in `WEBSITE_SNIPPET.html` into the site.

## What the owner needs

1. **No lead is ever lost.** Every quote request and chat is saved before any alert is sent.
2. **Instant email alert** for every new lead, verified chat, and call-back request. The owner uses Gmail phone notifications.
3. **Website chat:**
   - The customer enters name, email and phone.
   - **Email is verified** with a 6-digit code (sent by SMTP). **Phone is verified** with a text code (Firebase Phone Auth).
   - **No verification, no chat.** The server enforces this.
   - Then an **AI assistant answers questions**, and the customer can **leave a note to request a call back**.
4. The owner **replies from the admin**: email is sent directly, texts go through the owner's **Google Voice number (412) 447-8047**, and replies can also be sent into the website chat. **The owner does not want Twilio.**
5. Emails and phones are collected with a marketing opt-in, exportable to CSV.
6. Book jobs, **assign cleaners** (emailed automatically), and **add or edit customers and employees**.
7. **Client portal** and **host portal** (Airbnb / short-term rentals) with their own logins, bookings, requests, invoices with pay links, properties and turnover reports with photos.

All of the above is covered by `npm test` (32 integration tests, including the chat verification rules and the portal access-control rules).

## Stack

- **Node.js ≥ 22.13**, Express 4, Nodemailer, `@anthropic-ai/sdk`. There is no build step.
- **SQLite** via Node's built-in `node:sqlite`, stored in one file (`DATABASE_FILE`). It needs a **persistent disk**.
- **Prices:** `PRICE_SOURCE=site` (default) means the website's prices are the source of truth. The chat assistant **never quotes dollar amounts** and sends people to the site's quote form or a call back.
- **AI:** Claude via the official Anthropic SDK (`src/ai.js`), model `claude-opus-5` (override with `AI_MODEL`).
  - Low effort for short answers.
  - The system prompt is cached.
  - Server-side refusal fallbacks are on (`fallbacks: "default"`).
- **Phone verification:** Firebase Phone Auth in the browser (loaded from gstatic). The resulting ID token is **verified on the server** (`src/firebase.js`) against Google's public certs: signature, audience, issuer, expiry, and that `phone_number` matches what the user typed.
- **Texting = Google Voice (412) 447-8047.** It has no API, so the admin opens `voice.google.com/u/0/messages?itemId=t.+1XXXXXXXXXX` with the message copied, and logs it. Twilio code exists but is **off** unless `TWILIO_*` is set. Leave it unset.

```
src/server.js      entry point
src/app.js         routes (public, /api/chat/*, /api/admin/*)
src/chat.js        website chat: email codes, phone-token check, sessions, AI replies, call-backs
src/ai.js          Claude call + system prompt (built from knowledge.md + pricing)
src/firebase.js    Firebase ID-token verification (no firebase-admin needed)
src/service.js     leads, customers, messages, employees, jobs
src/notifier.js    email delivery, every attempt logged to `notifications`
src/auth.js        admin login, signed HttpOnly cookie, rate limit
src/db.js          schema (created automatically; new columns are added by migrate() on startup)
src/accounts.js    portal logins: scrypt passwords, one-time set/reset links, portal session cookie, rate limit
src/portal.js      client/host portal API (/api/portal) + admin invoices, properties, requests, reports
knowledge.md       what the chat assistant knows. The OWNER edits this.
public/chat.js     chat widget (one <script> tag)
public/embed.js    quote-form widget
public/pricing.js  price table, used by browser, server and AI
public/admin.*     admin app
public/portal.*    client portal (/portal) and host portal (/host): one page, screen chosen from the URL
WEBSITE_SNIPPET.html  exactly what to paste into the website
```

## Install

1. **Run the tests**
   ```bash
   cd shinepro-backoffice && npm ci && npm test && npm start   # http://localhost:3000/admin, password changeme123
   ```
2. **Host:** Render. New → Blueprint reads `render.yaml`, which sets up a 1 GB disk at `/var/data`. Any Node 22 host with a persistent disk also works.
3. **DNS:** add a CNAME for `admin.pghshinepro.com` pointing at the host, with HTTPS. Set `PUBLIC_URL=https://admin.pghshinepro.com`.
4. **Environment variables:** copy them from `.env.example`. In production the app refuses to start without `ADMIN_PASSWORD` (10+ characters) and `SESSION_SECRET` (32+ characters).
5. **Email (SMTP):** use Gmail with an App Password. Set `SMTP_*`, `EMAIL_FROM`, and `ALERT_EMAILS` (the owner's inbox). Email is required for the chat's email codes.
6. **Firebase Phone Auth** (for chat phone codes):
   1. console.firebase.google.com → Add project.
   2. Build → Authentication → Get started → Sign-in method → enable **Phone**.
   3. Authentication → Settings:
      - **Authorized domains:** add `pghshinepro.com` and `www.pghshinepro.com`.
      - **SMS region policy:** allow only **United States** (this blocks SMS-fraud costs).
   4. Upgrade to the **Blaze (pay-as-you-go)** plan if Firebase asks. It's required for sending real SMS beyond test numbers. Set a budget alert.
   5. Project settings → Your apps → add a **Web app**. Copy `apiKey`, `authDomain` and `projectId` into `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN` and `FIREBASE_PROJECT_ID`.
   6. Optional: add a test phone number under Sign-in method → Phone for QA without real texts.

   Keep `REQUIRE_PHONE_VERIFICATION=true`. If Firebase or SMTP isn't configured, the chat shows "Chat is offline, call or text (412) 447-8047" instead of allowing unverified chats.
7. **AI:** create a key at console.anthropic.com → `ANTHROPIC_API_KEY`. If the key is missing or the API fails, the chat still works: the customer gets a polite "we'll get back to you" reply and the owner is emailed the question.
8. **Texting:** set `GOOGLE_VOICE_NUMBER="(412) 447-8047"` and `BUSINESS_PHONE="(412) 447-8047"`. Leave `TWILIO_*` and `ALERT_PHONES` unset.
9. **Test:** Admin → Alerts shows green checks for Email, AI and Phone verification. Press **Send test alert**.

## Put it on the website

Everything is in **`WEBSITE_SNIPPET.html`**:
- **Chat:** `<script src="https://admin.pghshinepro.com/chat.js" async></script>` before `</body>` on every page. **Remove the site's current "Chat With Us" widget** so there's only one.
- **Quote form: keep the website's existing form and prices.** The owner's prices are final. Also POST each submission to `/api/leads` so the lead is saved and the owner is alerted (`sendLeadToShinePro()` in the snippet). With the default `PRICE_SOURCE=site`, the back office stores the price and service names **exactly as your form sends them** and never re-prices. Don't install the package's `embed.js` quote widget: it uses sample prices, and is only for `PRICE_SOURCE=package`.
- The site's origins must be in `ALLOWED_ORIGINS` (defaults to both `https://pghshinepro.com` and `https://www.pghshinepro.com`).

**`/api/leads` fields** (POST JSON or a normal form):

| field | notes |
|---|---|
| `name` | required |
| `phone`, `email` | at least one required |
| `service_type` | any text (e.g. "Deep Cleaning") |
| `bedrooms`, `bathrooms`, `sqft` | numbers |
| `frequency` | any text |
| `estimated_price` | the price your form showed. It's stored as-is when `PRICE_SOURCE=site`. |
| `address`, `zip`, `preferred_date`, `message` | text |
| `marketing_opt_in` | boolean |
| `company_website` | honeypot: keep it hidden and empty |

A JSON post returns `201 {ok, id, estimated_price}`. A normal form post redirects with a 303 to `/thanks.html`.

**The existing Back Office page:** point its tiles at the new admin (the URLs are in the snippet file), or port `src/service.js`, `src/chat.js` and `src/notifier.js` into the existing backend. None of them depend on the framework.

## SEO

See **`SEO_KIT.md`**. It covers finding and fixing site errors, a technical SEO checklist, HouseCleaningService structured data, page titles, Google Business Profile, and lead tracking. The back office itself is `noindex` and blocked in `robots.txt`, so it never competes with the main site. The chat sends `generate_lead` to GA4, GTM and Meta automatically.

## Chat API (`/api/chat`, CORS for ALLOWED_ORIGINS)

| Call | Purpose |
|---|---|
| `GET /config` | `{enabled, reason?, phoneVerification, firebase:{apiKey,authDomain,projectId}, businessPhone}` |
| `POST /email-code {email}` | Emails a 6-digit code. It expires in 10 min, is limited to 5 per email per hour, and 10 per hour per IP. |
| `POST /start {name,email,phone,email_code,phone_token,marketing_opt_in}` | Checks both verifications, then creates the client, lead and chat session. Returns `{token, messages}`. Codes lock after 5 wrong tries. |
| `POST /message {message}` | Bearer token. Saves the question and returns the AI reply. Limited to 40 messages per session and 1 every 1.5 s. |
| `GET /messages?after=ID` | Bearer token. The widget polls this every 5 s to show replies sent from the admin. |
| `POST /callback {note, best_time}` | Bearer token. Flags the lead as a call back and emails the owner urgently. |

## Client & host portals

**URLs** (the public website links to the first five, so keep them exactly):

| Page | URL |
|---|---|
| Client login | `/portal/login` (also `/portal/register`, `/portal/forgot`, `/portal/set-password?token=…`) |
| Client dashboard | `/portal` |
| My bookings | `/portal/bookings` |
| My invoices | `/portal/invoices` (printable invoice: `/portal/invoices/:id`) |
| Profile | `/portal/profile` |
| Host login | `/host/login` (same register / forgot / set-password pages under `/host`) |
| Host dashboard, properties, turnovers, invoices, profile | `/host`, `/host/properties`, `/host/turnovers` (report: `/host/turnovers/:id`), `/host/invoices`, `/host/profile` |

On the website, point the "Client Login" menu item at `https://admin.pghshinepro.com/portal/login`, and "My Bookings" / "My Invoices" at `/portal/bookings` and `/portal/invoices` on the same host. A host login link can go to `/host/login`.

**Accounts.** One login per customer (`portal_accounts`, linked to `customers`). The login is the customer's email. `is_host = 1` makes them a host (a customer with rental properties). No SMS or codes: access is given by emailing a one-time link.
- *Admin gives access:* client page → Client portal → "Turn on & email link". The `set` link expires in 72 h; a `reset` link (forgot password) in 2 h. Only the newest link works.
- *Self sign-up:* `/portal/register` sends the same link, but only if the email is already on a customer record. It always answers with the same message, so it can't be used to check who is a client. A disabled account stays disabled.
- Passwords: `crypto.scrypt`, 16-byte random salt per user, stored as `scrypt$salt$hash`. Minimum 8 characters.
- Session: `sp_portal` cookie (HttpOnly, SameSite=Lax so links from pghshinepro.com keep you logged in, Secure in production), HMAC-signed with a key derived from `SESSION_SECRET`, separate from the admin cookie. It contains the account's `session_version`, which goes up when the password changes (logs out other devices). Disabling the account ends sessions immediately.
- Login: 10 wrong passwords per IP per 15 minutes, then 429 (same rule as the admin). Mutations must be JSON (CSRF protection).

**Access control.** Every `/api/portal` query is filtered by the logged-in account's `customer_id`; no route takes a customer id from the browser. Other customers' rows answer 404. Cleaners are shown by first name only. Drafts are never shown to clients. Tests in `test/portal.test.js` check that one customer can't read another's jobs, invoices, properties, reports or photos.

**Requests.** Reschedule / cancel (client) and turnover (host) requests go into `portal_requests` and email `ALERT_EMAILS`. In Admin → Requests: *Approve* moves the job (and tells assigned cleaners), cancels it, or creates a turnover job on the property (start = checkout time, address and access notes from the property); *Decline* takes a note. The client is emailed either way, unless they turned off "booking and request updates" on their profile. "Request a cleaning" in the portal creates a normal lead, exactly like `/api/leads`.

**Invoices.** `invoices` table: customer, optional job, number (auto `SP-1001`…, editable, unique), amount, status `draft | sent | paid | void`, due date, `pay_url`, notes, `sent_at`, `paid_at`. Creating from a job fills in the client and the job's price. `pay_url` must be `https://` (meant for a **Stripe Payment Link**; any secure payment page works). "Save & email to client" marks a draft as sent and emails the amount, due date, pay link and the portal link. The "Pay now" button shows only while the invoice is `sent`. Payment is not reconciled automatically: mark it paid when Stripe shows the payment. (A Stripe webhook could do this later; it would need `STRIPE_WEBHOOK_SECRET` and the Payment Link's metadata.)

**Properties and turnover reports.** `properties` (owner customer, name, address, bedrooms, bathrooms, access notes, default checkout / check-in times, notes); hosts add and edit their own, the admin can too. `jobs.property_id` (nullable) links a turnover to a property; it is added to existing databases by `migrate()` in `src/db.js`. `job_reports` holds notes, damage notes, inventory notes and a JSON list of photos. Photos are uploaded by the admin (booking → "Report & photos"), sent as base64 JSON so the JSON-only CSRF rule still applies, checked by their actual bytes (JPEG, PNG, WebP or GIF only), limited to `UPLOAD_MAX_MB` (default 8 MB, browsers shrink big phone photos to 2000 px first) and 40 per report. Files are stored in `UPLOADS_DIR/jobs/<job id>/<random>.jpg`, by default an `uploads` folder next to `DATABASE_FILE` (so on the persistent disk; include it in backups). They are served only through `/api/portal/photos/…` (owning host) and `/api/admin/photos/…` (admin), never as static files.

**Portal API (`/api/portal`, portal cookie, JSON bodies):**
`POST /login {email,password}` · `POST /logout` · `GET /session` · `POST /register {email}` · `POST /forgot {email}` · `GET /password-link?token` · `POST /set-password {token,password}`
`GET /dashboard` · `GET /bookings` · `POST /bookings/:id/reschedule {scheduled_at,note}` · `POST /bookings/:id/cancel {note}` · `POST /bookings/new {service_type,frequency,preferred_date,address,message}`
`GET /invoices` · `GET /invoices/:id` · `GET|PUT /profile` · `POST /password {current_password,new_password}`
Hosts only: `GET|POST /properties` · `GET|PUT /properties/:id` · `GET|POST /turnovers {property_id,date,checkout_time,checkin_time,note}` · `GET /turnovers/:id` (report) · `GET /photos/:jobId/:file`

## Admin API (`/api/admin`, cookie session, JSON bodies)

`POST /login` · `POST /logout` · `GET /stats` · `GET /meta` · `GET /notifications` · `POST /test-alert`
`GET|POST /leads` · `GET|PATCH|DELETE /leads/:id` · `POST /leads/:id/messages {channel: email|gvoice|sms_in|chat|note, subject?, body}`
`GET|POST /customers` · `GET|PUT|DELETE /customers/:id` · `POST /customers/:id/messages` · `GET /customers/export.csv?opted_in=1`
`GET|POST /employees` · `GET|PUT|DELETE /employees/:id`
`GET|POST /jobs?from&to&status&employee_id&customer_id&property_id` · `GET|PUT|DELETE /jobs/:id` (jobs accept `property_id`)
`PUT /customers/:id/portal {enabled,is_host,send_link}` · `POST /customers/:id/portal/invite`
`GET|POST /invoices?status=all|draft|open|paid|void&customer_id` · `GET|PUT|DELETE /invoices/:id` · `POST /invoices/:id/send`
`GET|POST /properties?customer_id` · `GET|PUT|DELETE /properties/:id`
`GET /requests?status=pending|approved|declined|all` · `POST /requests/:id/approve {scheduled_at?,price?,duration_hours?,employee_ids?,admin_note?}` · `POST /requests/:id/decline {admin_note}`
`GET|PUT /jobs/:id/report {notes,damage_notes,inventory_notes}` · `POST /jobs/:id/report/photos {name,data(base64)}` · `DELETE /jobs/:id/report/photos/:file` · `GET /photos/:jobId/:file`

## Operations

- **Backups:** the DB is one file (`shinepro.db*`), and turnover photos are in `UPLOADS_DIR` (default `uploads/` next to it). Snapshot the disk daily (Render does this).
- **Health check:** `GET /health`. Failed emails appear in Admin → Alerts and as a dashboard warning.
- **Costs to watch:** Firebase SMS (set a budget alert), Anthropic usage (set a spend limit in the console).
- **Not included:** taking card payments directly (invoices link to a Stripe Payment Link instead, and are marked paid by hand), gift cards, job applications. These stay on the existing site.

## Go-live checklist

- [ ] Deployed with a persistent disk, HTTPS and `NODE_ENV=production`; `ADMIN_PASSWORD` and `SESSION_SECRET` set
- [ ] SMTP works: test alert received, and Gmail notifications on for the owner's phone
- [ ] Firebase: Phone sign-in enabled, both domains authorized, SMS region = US, web config in env
- [ ] `ANTHROPIC_API_KEY` set. Admin → Alerts shows all green.
- [ ] Old chat widget removed; `chat.js` added to every page
- [ ] **End-to-end chat test on the live site:**
  - Email code arrives.
  - Text code arrives.
  - A wrong code is rejected.
  - The AI answers a price question.
  - "Request a call back" sends the owner an urgent email.
  - A reply from the admin shows up in the chat.
- [ ] Existing quote form also posts to `/api/leads`. A real test quote shows in Admin → Leads **with the same price the website showed**, and the owner email and customer confirmation arrive.
- [ ] Ask the chat "how much is a deep clean?". It should point to the website's quote form, not give a number.
- [ ] On a lead, "Text via Google Voice" opens (412) 447-8047
- [ ] Owner reviewed `knowledge.md` (all `[CONFIRM]` lines)
- [ ] Existing Back Office tiles link to the new admin
- [ ] Website "Client Login", "My Bookings" and "My Invoices" links point to `/portal/login`, `/portal/bookings`, `/portal/invoices` on the back office host
- [ ] Portal test: turn on access for a test client, the set-password email arrives, log in, request a reschedule, approve it in Admin → Requests, the client email arrives
- [ ] Invoice test: create an invoice with a Stripe Payment Link, email it, "Pay now" opens Stripe
- [ ] Worked through `SEO_KIT.md` section 8 ("Done when")

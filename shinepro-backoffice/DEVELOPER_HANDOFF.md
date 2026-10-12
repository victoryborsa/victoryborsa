# Developer Handoff — Shine Pro Cleaning Back Office (final)

Hi! This package adds lead capture, an AI website chat, owner alerts, and customer/employee/job management to **pghshinepro.com**.
It's a small, self-contained Node.js service. Run it on a subdomain next to the existing site, then paste the snippets in `WEBSITE_SNIPPET.html` into the site.

## What the owner needs

1. **No lead is ever lost.** Every estimate request, contact message, website form and chat is saved before any alert is sent. Failed alerts are retried automatically.
2. **Instant email alert** for every new lead, new chat, and call-back request. The owner uses Gmail phone notifications.
3. **Website chat:**
   - The customer enters name, email and phone, then chats right away (`CHAT_VERIFICATION=none`, the default). The older code-verified flow is still available with `CHAT_VERIFICATION=codes`.
   - **Popular questions** (`src/answers.js`) can be tapped and are answered **instantly**.
   - Anything typed is answered by the **AI assistant**, which **streams** its reply so the first words appear right away. It answers the actual question and asks **one follow-up question at a time** (bedrooms/bathrooms, ZIP, type of cleaning, date).
   - If the AI is missing or fails, the chat still gives a **real answer** from `src/answers.js` and emails the owner the question.
   - "Urgent? Call or text (412) 447-8047" is always visible, and the customer can **request a call back**.
   - The widget runs in a Shadow DOM, so the site's CSS can't hide it, and it puts itself back if the page builder removes it. It stays open with the same conversation when the customer moves to another page.
4. The owner **replies from the admin**: email is sent directly, texts go through the owner's **Google Voice number (412) 447-8047**, and replies can also be sent into the website chat. **The owner does not want Twilio.**
5. Emails and phones are collected with a marketing opt-in, exportable to CSV.
6. Book jobs, **assign cleaners** (emailed automatically), and **add or edit customers and employees**.
7. **Client portal** and **host portal** (Airbnb / short-term rentals) with their own logins, bookings, requests, invoices with pay links, properties and turnover reports with photos.

All of the above is covered by `npm test` (integration tests, including the chat rules and the portal access-control rules). To try the chat locally: `npm run preview`, then open http://localhost:3000/chat-preview.html (without `ANTHROPIC_API_KEY` it uses a stand-in AI that streams the instant answers).

## Stack

- **Node.js ≥ 22.13**, Express 4, Nodemailer, `@anthropic-ai/sdk`. There is no build step.
- **SQLite** via Node's built-in `node:sqlite`, stored in one file (`DATABASE_FILE`). It needs a **persistent disk**.
- **Prices:** only in `public/pricing.js` (see *Prices* below). The server re-prices every estimate; the chat assistant quotes estimates from the same list, always with the $20 travel fee.
- **AI:** Claude via the official Anthropic SDK (`src/ai.js`), model `claude-opus-5-5` (override with `AI_MODEL`).
  - Streamed (`?stream=1` on `/api/chat/message` returns Server-Sent Events), low effort for short, fast answers.
  - If replies ever feel slow to start, `AI_MODEL=claude-haiku-4-5` is the quickest model to first words (simpler answers).
  - The system prompt is cached.
  - Server-side refusal fallbacks are on (`fallbacks: "default"`).
- **Phone verification (only with `CHAT_VERIFICATION=codes`):** Firebase Phone Auth in the browser (loaded from gstatic). The resulting ID token is **verified on the server** (`src/firebase.js`) against Google's public certs: signature, audience, issuer, expiry, and that `phone_number` matches what the user typed.
- **Texting = Google Voice (412) 447-8047.** It has no API, so the admin opens `voice.google.com/u/0/messages?itemId=t.+1XXXXXXXXXX` with the message copied, and logs it. Twilio code exists but is **off** unless `TWILIO_*` is set. Leave it unset.

```
src/server.js      entry point
src/app.js         routes (public, /api/chat/*, /api/admin/*)
src/chat.js        website chat: email codes, phone-token check, sessions, AI replies, call-backs
src/ai.js          Claude call + system prompt (built from knowledge.md + pricing)
src/firebase.js    Firebase ID-token verification (no firebase-admin needed)
src/service.js     leads, customers, messages, employees, jobs
src/notifier.js    email/text delivery: every send logged to `notifications`, automatic retries, admin Retry
src/website.js     /api/contact, /api/newsletter, /api/forms + Admin → Website forms
src/auth.js        admin login, signed HttpOnly cookie, rate limit
src/db.js          schema (created automatically; new columns are added by migrate() on startup)
src/accounts.js    portal logins: scrypt passwords, one-time set/reset links, portal session cookie, rate limit
src/portal.js      client/host portal API (/api/portal) + admin invoices, properties, requests, reports
knowledge.md       what the chat assistant knows. The OWNER edits this.
public/chat.js     chat widget (one <script> tag)
public/embed.js    estimate widget (optional; same prices)
public/pricing.js  THE price list and calculator: website, server, invoices and AI
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
5. **Email (SMTP):** use Gmail with an App Password. Set `SMTP_*`, `EMAIL_FROM`, and `ALERT_EMAILS` (the owner's inbox). Email is needed for owner alerts (and for the chat's email codes in `codes` mode).
6. **Firebase Phone Auth** (only if you switch to `CHAT_VERIFICATION=codes`):
   1. console.firebase.google.com → Add project.
   2. Build → Authentication → Get started → Sign-in method → enable **Phone**.
   3. Authentication → Settings:
      - **Authorized domains:** add `pghshinepro.com` and `www.pghshinepro.com`.
      - **SMS region policy:** allow only **United States** (this blocks SMS-fraud costs).
   4. Upgrade to the **Blaze (pay-as-you-go)** plan if Firebase asks. It's required for sending real SMS beyond test numbers. Set a budget alert.
   5. Project settings → Your apps → add a **Web app**. Copy `apiKey`, `authDomain` and `projectId` into `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN` and `FIREBASE_PROJECT_ID`.
   6. Optional: add a test phone number under Sign-in method → Phone for QA without real texts.

   In `codes` mode keep `REQUIRE_PHONE_VERIFICATION=true`. If Firebase or SMTP isn't configured, the chat shows "Chat is offline, call or text (412) 447-8047" instead of allowing unverified chats.
7. **AI:** create a key at console.anthropic.com → `ANTHROPIC_API_KEY`. If the key is missing or the API fails, the chat still works: the customer gets a real answer from `src/answers.js` (or "a team member will reply shortly" if nothing matches) and the owner is emailed the question.
8. **Texting:** set `GOOGLE_VOICE_NUMBER="(412) 447-8047"` and `BUSINESS_PHONE="(412) 447-8047"`. Leave `TWILIO_*` and `ALERT_PHONES` unset.
9. **Test:** Admin → Alerts shows green checks for Email and AI. Press **Send test alert**.

## Put it on the website

Everything to paste is in **`WEBSITE_SNIPPET.html`**:
- **Chat:** `<script src="https://admin.pghshinepro.com/chat.js" async></script>` before `</body>` on every page. **Remove the site's current "Chat With Us" widget** so there's only one.
- **Forms:** the static website posts JSON to the four endpoints below. Its origins must be in **`SITE_ORIGINS`** (comma separated, default `https://pghshinepro.com,https://www.pghshinepro.com`); `ALLOWED_ORIGINS` (used by the chat) is also accepted.
- The package's own estimate widget (`embed.js`) uses the same `pricing.js` and posts to `/api/leads`; it's optional.

### Prices: change them only in `public/pricing.js`

`public/pricing.js` is **the** price list and calculator (service × home size, what each service already includes, add-ons, recurring discounts, and `travelFee: 20`). `quote(input)` returns itemized lines (`service`, `addon`, `included`, `discount`, `travel`) and a total that always includes **one "Travel Fee — $20" line per visit**; `estimatePrice(input)` returns the total, or `null` for a custom quote. The website build copies this file; the back office uses it to **re-price every request** (whatever price the browser sends is ignored), for invoices and in the chat assistant's prompt. To change a price: edit `pricing.js`, rebuild the website, redeploy the back office.

### Endpoints the website uses

All take JSON (`Content-Type: application/json`), answer CORS for `SITE_ORIGINS`, are rate limited (20 per hour per IP each) and have a honeypot: a hidden `company_website` field that must stay empty (if it's filled the answer is `200 {ok:true}` and nothing is saved). Every one accepts **`request_id`** (6–100 characters of letters, digits, `_ . : -`; a UUID from `crypto.randomUUID()` is ideal). Make one per form fill and reuse it when the visitor retries: a repeat returns the **original** record with `200` and `duplicate: true` and sends no new emails. Errors are `400 {error: "A plain sentence for the visitor"}` (`429` when rate limited).

`preferred_contact` is `phone`, `text` or `email` and must match a channel they gave (choosing `email` needs an email, `phone`/`text` need a phone). At least one of `phone` / `email` is always required. Marketing is separate from service messages: only `marketing_opt_in: true` (a separate, unticked checkbox) or the newsletter turns it on, and nothing ever turns it off here.

**`POST /api/leads`** (free estimate)

| field | notes |
|---|---|
| `name` | required |
| `phone`, `email` | at least one required |
| `preferred_contact` | `phone` \| `text` \| `email` |
| `service_type` (alias `service`) | a `pricing.js` service id: `standard`, `deep`, `move`, `recurring`, `apartment`, `airbnb`, `event`, `commercial`, `postconstruction`, `upholstery` (labels like "Deep Cleaning" also work). Unknown text is stored as-is with no price. |
| `bedrooms` (alias `size`) | `'1'`…`'5'` (5 = 5+) |
| `frequency` | `once` \| `weekly` \| `biweekly` \| `monthly` (only used for `recurring`) |
| `addons` | array (or comma list) of add-on ids: `fridge`, `oven`, `windows`, `laundry`, `cabinets`, `organizing`, `walls`, `balcony`, `dishes` |
| `organizing_hours` (alias `organizingHours`) | 1–8, with the `organizing` add-on |
| `bathrooms`, `sqft` | numbers, stored for the team |
| `address`, `zip`, `preferred_date`, `preferred_time`, `referred_by`, `gift_code`, `message` | text |
| `marketing_opt_in` | `true` only if the separate marketing box was ticked |
| `request_id`, `company_website` | see above |
| `estimated_price` / `estimated_total` | ignored (display only on the website) |

Duplicates: the same `request_id`, **or** the same email/phone asking for the same service within 2 minutes. Answer: `201` (new) or `200` (duplicate)
`{ ok: true, id, lead_id, duplicate, estimated_price, quote, breakdown }` where `quote` is the `pricing.js` `quote()` result the server computed (or `null` for an unknown service) and `breakdown` is what was stored: `{ lines, subtotal, discount, travel_fee, total, quote_only }`. Custom-quote services (`event`, `commercial`, `postconstruction`, `upholstery`, `airbnb` with 4+ bedrooms) have `estimated_price: null`, `quote.quoteOnly: true`, and their lines still contain the travel fee. A normal HTML form post (not JSON, `Accept: text/html`) redirects with a 303 to `/thanks.html`.

**`POST /api/contact`**: `name` (required), `email` and/or `phone`, `preferred_contact`, `interest` (text, e.g. "Deep cleaning"; never priced), `message` (required), `marketing_opt_in`, `request_id`, `company_website`. Saved as a lead with source `contact` (it shows in Admin → Leads), the owner gets an email and the customer a confirmation. Duplicates as for leads. Answer `201`/`200 { ok, id, lead_id, duplicate }`.

**`POST /api/newsletter`**: `email` (required), `consent: true` (required, otherwise 400 "Please tick the box…"), optional `name`, `request_id`, `company_website`. Creates or updates the client with `marketing_opt_in = 1` (and `marketing_opt_in_at`). Answer `201 { ok, id, duplicate: false }`, or `200 { ok, id, duplicate: true }` if that email was already subscribed.

**`POST /api/forms`** (event quotes, careers, gift card orders, referrals, local area quotes…): `form` (required, the form's name as shown, up to 80 characters, e.g. `"Careers"`, `"Gift card"`, `"Quote request (Shadyside)"`), `name`, `email` and/or `phone`, `preferred_contact`, `fields` (an object of `label: value`; arrays are joined with commas; other top-level keys are kept as fields too), `request_id`, `company_website`. Limits: 40 fields, labels 80 characters, each value 5,000 characters, 20,000 characters in total. Saved in `form_submissions` (Admin → **Website forms**, with read/unread), owner emailed. Duplicates: the same `request_id`, or the same form + contact + answers within 2 minutes. Answer `201`/`200 { ok, id, duplicate }`.

**The existing Back Office page:** point its tiles at the new admin (the URLs are in the snippet file), or port `src/service.js`, `src/chat.js` and `src/notifier.js` into the existing backend. None of them depend on the framework.

## SEO

See **`SEO_KIT.md`**. It covers finding and fixing site errors, a technical SEO checklist, HouseCleaningService structured data, page titles, Google Business Profile, and lead tracking. The back office itself is `noindex` and blocked in `robots.txt`, so it never competes with the main site. The chat sends `generate_lead` to GA4, GTM and Meta automatically.

## Chat API (`/api/chat`, CORS for ALLOWED_ORIGINS)

| Call | Purpose |
|---|---|
| `GET /config` | `{enabled, reason?, verification: none\|codes, phoneVerification, firebase, businessPhone, questions:[{id,label,answer}]}` |
| `POST /email-code {email}` | `codes` mode only. Emails a 6-digit code. It expires in 10 min, is limited to 5 per email per hour, and 10 per hour per IP. |
| `POST /start {name,email,phone,marketing_opt_in}` (+ `email_code, phone_token` in `codes` mode) | Creates the client, lead and chat session and emails the owner. Returns `{token, messages}`. Codes lock after 5 wrong tries. |
| `POST /message {message}` or `{question_id}` | Bearer token. Saves the question and the reply. With `?stream=1` it answers as Server-Sent Events (`mine`, then `delta` pieces, then `done`); otherwise JSON `{messages}`. Popular questions are answered instantly without the AI. Limited to 40 messages per session and 1 per second. |
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

**Invoices.** `invoices` table: customer, optional job, number (auto `SP-1001`…, editable, unique), `items` (JSON lines `[{description, amount, kind}]`, kind `service|addon|included|discount|travel|other`), amount (always the sum of the items), status `draft | sent | paid | void`, due date, `pay_url`, notes, `sent_at`, `paid_at`. Creating from a job fills in the client and its lines: the booked estimate's lines when the job price still matches it, otherwise one service line (job price − $20) plus exactly one "Travel Fee — $20" line (`jobs.price` includes the travel fee). An invoice can't have a second travel fee line, and that line's amount always comes from `pricing.js`. Changing only `amount` works for a one-line invoice; with several lines, edit the lines. Invoices from before line items show as one line. `pay_url` must be `https://` (meant for a **Stripe Payment Link**; any secure payment page works). "Save & email to client" marks a draft as sent and emails the amount, due date, pay link and the portal link. The "Pay now" button shows only while the invoice is `sent`. Payment is not reconciled automatically: mark it paid when Stripe shows the payment. (A Stripe webhook could do this later; it would need `STRIPE_WEBHOOK_SECRET` and the Payment Link's metadata.)

**Properties and turnover reports.** `properties` (owner customer, name, address, bedrooms, bathrooms, access notes, default checkout / check-in times, notes); hosts add and edit their own, the admin can too. `jobs.property_id` (nullable) links a turnover to a property; it is added to existing databases by `migrate()` in `src/db.js`. `job_reports` holds notes, damage notes, inventory notes and a JSON list of photos. Photos are uploaded by the admin (booking → "Report & photos"), sent as base64 JSON so the JSON-only CSRF rule still applies, checked by their actual bytes (JPEG, PNG, WebP or GIF only), limited to `UPLOAD_MAX_MB` (default 8 MB, browsers shrink big phone photos to 2000 px first) and 40 per report. Files are stored in `UPLOADS_DIR/jobs/<job id>/<random>.jpg`, by default an `uploads` folder next to `DATABASE_FILE` (so on the persistent disk; include it in backups). They are served only through `/api/portal/photos/…` (owning host) and `/api/admin/photos/…` (admin), never as static files.

**Portal API (`/api/portal`, portal cookie, JSON bodies):**
`POST /login {email,password}` · `POST /logout` · `GET /session` · `POST /register {email}` · `POST /forgot {email}` · `GET /password-link?token` · `POST /set-password {token,password}`
`GET /dashboard` · `GET /bookings` · `POST /bookings/:id/reschedule {scheduled_at,note}` · `POST /bookings/:id/cancel {note}` · `POST /bookings/new {service_type,frequency,preferred_date,address,message}`
`GET /invoices` · `GET /invoices/:id` · `GET|PUT /profile` · `POST /password {current_password,new_password}`
Hosts only: `GET|POST /properties` · `GET|PUT /properties/:id` · `GET|POST /turnovers {property_id,date,checkout_time,checkin_time,note}` · `GET /turnovers/:id` (report) · `GET /photos/:jobId/:file`

## Admin API (`/api/admin`, cookie session, JSON bodies)

`POST /login` · `POST /logout` · `GET /stats` · `GET /meta` · `GET /notifications?status=failed` · `POST /notifications/:id/retry` · `POST /test-alert`
`GET /forms?status=all|unread|read` · `GET|DELETE /forms/:id` · `PATCH /forms/:id {read}`
`GET|POST /leads` · `GET|PATCH|DELETE /leads/:id` · `POST /leads/:id/messages {channel: email|gvoice|sms_in|chat|note, subject?, body}`
`GET|POST /customers` · `GET|PUT|DELETE /customers/:id` · `POST /customers/:id/messages` · `GET /customers/export.csv?opted_in=1`
`GET|POST /employees` · `GET|PUT|DELETE /employees/:id`
`GET|POST /jobs?from&to&status&employee_id&customer_id&property_id` · `GET|PUT|DELETE /jobs/:id` (jobs accept `property_id`; a job made with `lead_id` copies the lead's price, service and `price_breakdown`; saving returns `warnings` when an assigned cleaner has an overlapping scheduled job) · `GET /jobs/conflicts?employee_ids=1,2&scheduled_at&duration_hours&job_id`
`PUT /customers/:id/portal {enabled,is_host,send_link}` · `POST /customers/:id/portal/invite`
`GET|POST /invoices?status=all|draft|open|paid|void&customer_id` · `GET /invoices/prefill?job_id` · `GET|PUT|DELETE /invoices/:id` (`items: [{description, amount, kind}]`) · `POST /invoices/:id/send`
`GET|POST /properties?customer_id` · `GET|PUT|DELETE /properties/:id`
`GET /requests?status=pending|approved|declined|all` · `POST /requests/:id/approve {scheduled_at?,price?,duration_hours?,employee_ids?,admin_note?}` · `POST /requests/:id/decline {admin_note}`
`GET|PUT /jobs/:id/report {notes,damage_notes,inventory_notes}` · `POST /jobs/:id/report/photos {name,data(base64)}` · `DELETE /jobs/:id/report/photos/:file` · `GET /photos/:jobId/:file`

## Operations

- **Backups:** the DB is one file (`shinepro.db*`), and turnover photos are in `UPLOADS_DIR` (default `uploads/` next to it). Snapshot the disk daily (Render does this).
- **Health check:** `GET /health`.
- **Email/text log and retries:** every email/text is one row in `notifications` (kind, channel, recipient, status `sending|retrying|sent|failed|skipped`, error, attempts, lead or form, and the message itself so it can be resent). The first try happens right away; if it fails it is tried again after `NOTIFY_RETRY_DELAYS_MS` (default 5 s, then 30 s), 3 tries in total. A sent message is never sent again. Messages the admin sends by hand (replies, invoices, test alerts) are not auto-retried: the admin sees the error. Admin → Alerts and each lead page list them with a **Retry** button for failed/skipped ones (`POST /api/admin/notifications/:id/retry`). Failed owner alerts also show as a dashboard warning.
- **Costs to watch:** Firebase SMS (set a budget alert), Anthropic usage (set a spend limit in the console).
- **Not included:** taking card payments directly (invoices link to a Stripe Payment Link instead, and are marked paid by hand), or selling gift cards online. Gift card orders and job applications arrive as website forms.

## Go-live checklist

- [ ] Deployed with a persistent disk, HTTPS and `NODE_ENV=production`; `ADMIN_PASSWORD` and `SESSION_SECRET` set
- [ ] SMTP works: test alert received, and Gmail notifications on for the owner's phone
- [ ] Firebase: Phone sign-in enabled, both domains authorized, SMS region = US, web config in env
- [ ] `ANTHROPIC_API_KEY` set. Admin → Alerts shows all green.
- [ ] Old chat widget removed; `chat.js` added to every page
- [ ] **End-to-end chat test on the live site:**
  - The chat won't start with a missing name, a bad email or a bad phone, and the owner gets a "New website chat" email when it starts.
  - Tapping a popular question answers instantly; "I want my house cleaned" gets an answer that starts within about 2 seconds and asks about bedrooms and bathrooms.
  - The AI's price answers match `pricing.js` and include the $20 travel fee.
  - "Request a call back" sends the owner an urgent email.
  - A reply from the admin shows up in the chat.
- [ ] `SITE_ORIGINS` lists the website's origins. A real test estimate (deep, 2 bedrooms) shows in Admin → Leads at **$329** with the Travel Fee line, the owner email and customer confirmation arrive with the lines and total, and pressing submit twice saves it once.
- [ ] Contact form, newsletter and one website form (e.g. Careers) each arrive (Leads / Clients with marketing on / Website forms).
- [ ] On a lead, "Text via Google Voice" opens (412) 447-8047
- [ ] Owner reviewed `knowledge.md` (all `[CONFIRM]` lines)
- [ ] Existing Back Office tiles link to the new admin
- [ ] Website "Client Login", "My Bookings" and "My Invoices" links point to `/portal/login`, `/portal/bookings`, `/portal/invoices` on the back office host
- [ ] Portal test: turn on access for a test client, the set-password email arrives, log in, request a reschedule, approve it in Admin → Requests, the client email arrives
- [ ] Invoice test: create an invoice with a Stripe Payment Link, email it, "Pay now" opens Stripe
- [ ] Worked through `SEO_KIT.md` section 8 ("Done when")

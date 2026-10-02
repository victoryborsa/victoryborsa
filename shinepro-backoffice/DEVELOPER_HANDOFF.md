# Developer Handoff — Shine Pro Cleaning Back Office (final)

Hi! This package adds lead capture, an AI website chat, owner alerts, and customer/employee/job management to **pghshinepro.com**.
It's a small, self-contained Node.js service. Run it on a subdomain next to the existing site, then paste the snippets in `WEBSITE_SNIPPET.html` into the site.

## What the owner needs

1. **No lead is ever lost.** Every quote request and chat is saved before any alert is sent.
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

All of the above is covered by `npm test`. To try the chat locally: `npm run preview`, then open http://localhost:3000/chat-preview.html (without `ANTHROPIC_API_KEY` it uses a stand-in AI that streams the instant answers).

## Stack

- **Node.js ≥ 22.13**, Express 4, Nodemailer, `@anthropic-ai/sdk`. There is no build step.
- **SQLite** via Node's built-in `node:sqlite`, stored in one file (`DATABASE_FILE`). It needs a **persistent disk**.
- **Prices:** `PRICE_SOURCE=site` (default) means the website's prices are the source of truth. The chat assistant **never quotes dollar amounts**; it collects the estimate details and the team confirms the price.
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
src/notifier.js    email delivery, every attempt logged to `notifications`
src/auth.js        admin login, signed HttpOnly cookie, rate limit
src/db.js          schema (created automatically)
knowledge.md       what the chat assistant knows. The OWNER edits this.
public/chat.js     chat widget (one <script> tag)
public/embed.js    quote-form widget
public/pricing.js  price table, used by browser, server and AI
public/admin.*     admin app
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
| `GET /config` | `{enabled, reason?, verification: none\|codes, phoneVerification, firebase, businessPhone, questions:[{id,label,answer}]}` |
| `POST /email-code {email}` | `codes` mode only. Emails a 6-digit code. It expires in 10 min, is limited to 5 per email per hour, and 10 per hour per IP. |
| `POST /start {name,email,phone,marketing_opt_in}` (+ `email_code, phone_token` in `codes` mode) | Creates the client, lead and chat session and emails the owner. Returns `{token, messages}`. Codes lock after 5 wrong tries. |
| `POST /message {message}` or `{question_id}` | Bearer token. Saves the question and the reply. With `?stream=1` it answers as Server-Sent Events (`mine`, then `delta` pieces, then `done`); otherwise JSON `{messages}`. Popular questions are answered instantly without the AI. Limited to 40 messages per session and 1 per second. |
| `GET /messages?after=ID` | Bearer token. The widget polls this every 5 s to show replies sent from the admin. |
| `POST /callback {note, best_time}` | Bearer token. Flags the lead as a call back and emails the owner urgently. |

## Admin API (`/api/admin`, cookie session, JSON bodies)

`POST /login` · `POST /logout` · `GET /stats` · `GET /meta` · `GET /notifications` · `POST /test-alert`
`GET|POST /leads` · `GET|PATCH|DELETE /leads/:id` · `POST /leads/:id/messages {channel: email|gvoice|sms_in|chat|note, subject?, body}`
`GET|POST /customers` · `GET|PUT|DELETE /customers/:id` · `POST /customers/:id/messages` · `GET /customers/export.csv?opted_in=1`
`GET|POST /employees` · `GET|PUT|DELETE /employees/:id`
`GET|POST /jobs?from&to&status&employee_id&customer_id` · `GET|PUT|DELETE /jobs/:id`

## Operations

- **Backups:** the DB is one file (`shinepro.db*`). Snapshot the disk daily (Render does this).
- **Health check:** `GET /health`. Failed emails appear in Admin → Alerts and as a dashboard warning.
- **Costs to watch:** Firebase SMS (set a budget alert), Anthropic usage (set a spend limit in the console).
- **Not included:** payments, gift cards, job applications. These stay on the existing site.

## Go-live checklist

- [ ] Deployed with a persistent disk, HTTPS and `NODE_ENV=production`; `ADMIN_PASSWORD` and `SESSION_SECRET` set
- [ ] SMTP works: test alert received, and Gmail notifications on for the owner's phone
- [ ] Firebase: Phone sign-in enabled, both domains authorized, SMS region = US, web config in env
- [ ] `ANTHROPIC_API_KEY` set. Admin → Alerts shows all green.
- [ ] Old chat widget removed; `chat.js` added to every page
- [ ] **End-to-end chat test on the live site:**
  - The chat won't start with a missing name, a bad email or a bad phone, and the owner gets a "New website chat" email when it starts.
  - Tapping a popular question answers instantly; "I want my house cleaned" gets an answer that starts within about 2 seconds and asks about bedrooms and bathrooms.
  - The AI answers a price question without giving a number.
  - "Request a call back" sends the owner an urgent email.
  - A reply from the admin shows up in the chat.
- [ ] Existing quote form also posts to `/api/leads`. A real test quote shows in Admin → Leads **with the same price the website showed**, and the owner email and customer confirmation arrive.
- [ ] Ask the chat "how much is a deep clean?". It should ask for the home's details, not give a number.
- [ ] On a lead, "Text via Google Voice" opens (412) 447-8047
- [ ] Owner reviewed `knowledge.md` (all `[CONFIRM]` lines)
- [ ] Existing Back Office tiles link to the new admin
- [ ] Worked through `SEO_KIT.md` section 8 ("Done when")

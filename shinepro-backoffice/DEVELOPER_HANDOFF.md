# Developer Handoff — Shine Pro Cleaning Back Office

Hi! This package adds lead capture, owner alerts, and customer/employee/job management to **pghshinepro.com**.
It's a small, self-contained Node.js service. You can run it next to the existing site, or port its logic into the existing backend.

## Owner's requirements (what this must do)

1. Every quote request on the website is saved. None can be lost, even if email/SMS is down.
2. The owner gets an **email and a text** for every new lead.
3. The owner can **reply to customers by text or email from the admin**, and customer text replies appear there.
4. Emails and phones are collected (with marketing opt-in) for future marketing.
5. Book jobs and **assign cleaners**. Cleaners get notified.
6. **Add/edit customers and employees** from the admin.

All of the above is implemented and covered by `npm test` (10 integration tests).

## Stack

- **Node.js ≥ 22.13**, Express 4, Nodemailer. No other runtime dependencies.
- **SQLite** via Node's built-in `node:sqlite`, stored in a single file (`DATABASE_FILE`). It needs a **persistent disk**.
- Twilio is called over its REST API with `fetch` (no SDK).
- Admin UI is a plain-JS SPA (`public/admin.js`) with no build step.

```
src/server.js      entry point
src/app.js         routes (public + /api/admin/*)
src/service.js     business logic (leads, customers, messages, employees, jobs)
src/notifier.js    email (SMTP) + SMS (Twilio) delivery, logged to `notifications`
src/auth.js        password login, HMAC-signed HttpOnly cookie, rate limit
src/db.js          schema (auto-created on start)
public/pricing.js  price table + estimator, shared by browser AND server
public/embed.js    drop-in quote widget for any website
public/admin.*     admin app
test/              node:test integration tests
```

## Install (recommended: run alongside the site on a subdomain)

1. **Host:** Render (the `render.yaml` blueprint at the repo root is ready, with a 1 GB disk at `/var/data`), Railway, Fly.io, or any VPS with Node 22.
   ```bash
   cd shinepro-backoffice && npm ci && npm test && npm start
   ```
2. **DNS:** point `admin.pghshinepro.com` (CNAME) at the host and enable HTTPS. Set `PUBLIC_URL=https://admin.pghshinepro.com`.
3. **Env vars:** copy `.env.example`. Required in production: `ADMIN_PASSWORD` (10+ chars) and `SESSION_SECRET` (32+ chars). The app refuses to start without them.
4. **Email:** any SMTP. For Gmail, use an App Password. Set `ALERT_EMAILS` to the owner's address.
5. **SMS:** Twilio number + **A2P 10DLC registration** (required for US business SMS). Set `ALERT_PHONES` to the owner's cell.
   In Twilio, set the number's **"A message comes in"** webhook → `POST https://admin.pghshinepro.com/api/twilio/sms`.
   Signatures are verified against `PUBLIC_URL`, so it must exactly match the public URL.
6. Log in at `/admin` → **Alerts → Send test alert** and confirm both the email and the text arrive.

## Connect the website's quote form (pick one)

**A. Embed widget (fastest).** It has its own scoped CSS and live price calculation:
```html
<div id="shinepro-quote"></div>
<script src="https://admin.pghshinepro.com/embed.js" async></script>
```
It fires `gtag('event','generate_lead')` and `fbq('track','Lead')` on success if those exist.

**B. Keep the existing form.** POST to `https://admin.pghshinepro.com/api/leads` as JSON (response `201 {ok, id, estimated_price}`), or as a normal HTML form post (it redirects 303 to `/thanks.html`). The site's origin must be in `ALLOWED_ORIGINS` (CORS).

| field | notes |
|---|---|
| `name` | required |
| `phone`, `email` | at least one required; phone normalized to E.164 |
| `service_type` | `standard` \| `deep` \| `move` \| `airbnb` \| `office` |
| `bedrooms`, `bathrooms`, `sqft` | numbers |
| `frequency` | `once` \| `monthly` \| `biweekly` \| `weekly` |
| `address`, `zip`, `preferred_date`, `message` | text |
| `marketing_opt_in` | boolean / `on` / `1` |
| `company_website` | **honeypot**: leave it as a hidden, empty field |

The server **recalculates the price** from `public/pricing.js`, so a client-sent `estimated_price` is ignored when `service_type` is valid. **To change prices, edit that one file.** If the existing site shows its own prices, make the numbers match.

Rate limit: 20 submissions/hour/IP.

**C. Link out.** Point the "Get a Quote" button to `https://admin.pghshinepro.com/quote`.

## Existing admin ("Back Office" page)

The current site already has a Back Office page with Leads/Clients/Employees tiles. Options:
- **Simplest:** point those tiles at `https://admin.pghshinepro.com/admin#/leads`, `#/customers`, `#/employees`, `#/jobs`, `#/calendar`.
- **Or port it:** if you'd rather keep a single app, `src/service.js` (logic), `src/notifier.js` (alerts) and the schema in `src/db.js` are framework-agnostic and map 1:1 to Postgres/Supabase tables. The important rule to keep: **insert the lead first, then send alerts asynchronously, and log each delivery result.**

## Admin API (all under `/api/admin`, cookie session, JSON bodies)

`POST /login {password}` · `POST /logout` · `GET /stats` · `GET /notifications` · `POST /test-alert`
`GET|POST /leads` · `GET|PATCH|DELETE /leads/:id` · `POST /leads/:id/messages {channel: sms|email|note, subject?, body}`
`GET|POST /customers` · `GET|PUT|DELETE /customers/:id` · `POST /customers/:id/messages` · `GET /customers/export.csv?opted_in=1`
`GET|POST /employees` · `GET|PUT|DELETE /employees/:id`
`GET|POST /jobs?from&to&status&employee_id&customer_id` · `GET|PUT|DELETE /jobs/:id {customer_id, scheduled_at "YYYY-MM-DDTHH:MM", employee_ids[], notify_employees, …}`

Non-GET/DELETE admin requests must be `application/json`. Together with the `SameSite=Strict` cookie, that is the CSRF protection.

## Operations

- **Backups:** the DB is one file. Snapshot the disk (Render does it daily) or copy `shinepro.db*` on a schedule.
- **Health check:** `GET /health`.
- **Logs:** failed deliveries are logged to stdout and shown in Admin → Alerts. The dashboard warns if lead alerts failed in the last 7 days.
- **Not included yet:** payments, gift cards, job applications. These are still handled by the existing site.

## Go-live checklist

- [ ] Deployed with a persistent disk, HTTPS, and `NODE_ENV=production`
- [ ] `ADMIN_PASSWORD` and `SESSION_SECRET` set; owner can log in
- [ ] SMTP + Twilio configured; **test alert** received by both email and text
- [ ] Twilio inbound webhook set; texting the business number shows up in the admin
- [ ] Website form connected (A, B or C). Submit a real test quote and confirm the lead, owner email, owner text and customer confirmation.
- [ ] `ALLOWED_ORIGINS` includes both `https://pghshinepro.com` and `https://www.pghshinepro.com`
- [ ] Prices in `public/pricing.js` confirmed with the owner
- [ ] Existing Back Office tiles linked to the new admin

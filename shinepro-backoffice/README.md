# Shine Pro Cleaning — Back Office

Lead capture + admin for **pghshinepro.com**. Nothing gets missed:

| Feature | What it does |
|---|---|
| **Instant quote form** | Visitors see their price live. Every submission is saved *first*, then alerts go out. |
| **New-lead alerts** | Email **and** text message to you the moment someone requests a quote, with a link straight to the lead. Customer gets an automatic "we got your request" email. |
| **Leads pipeline** | New → Contacted → Quoted → Booked / Lost. Dashboard shows new leads first, with a red badge. |
| **Reply from admin** | Send the customer a **text** or **email** from the lead page (quick-reply templates included). Private notes too. |
| **Customer replies** | When a customer texts back, it shows up in the conversation and you get an email. Texts from unknown numbers become new leads. |
| **Clients** | Add, edit, search, delete. Every lead auto-creates/updates a client. Export all, or only the people who opted in to marketing, to CSV (for Mailchimp, etc.). |
| **Employees** | Add/edit cleaners, mark inactive, see each person's upcoming jobs. |
| **Bookings & calendar** | Book a job from a lead or client, assign one or more cleaners. Cleaners get a text/email with date, address and notes. Week calendar highlights jobs with no cleaner. |
| **Alerts log** | Every email/text shows as sent, failed or skipped. There's a "Send test alert" button, and a warning on the dashboard if alerts aren't working. |

## 1. Run it on your computer (to try it)

Requires Node.js 22.13 or newer. **Web developer? Start with [DEVELOPER_HANDOFF.md](DEVELOPER_HANDOFF.md).**

```bash
cd shinepro-backoffice
npm install
npm start
```
Open http://localhost:3000/admin (dev password: `changeme123`) and http://localhost:3000/quote.

## 2. Put it online (Render.com, about $7/month)

1. Push this repo to GitHub (already done if you're reading this there).
2. On render.com → **New → Blueprint** → pick this repo. It reads `render.yaml`.
3. Fill in the environment variables (see `.env.example` for what each one means).
4. Optional: in Render → Settings → Custom Domain, add `admin.pghshinepro.com` and set `PUBLIC_URL` to match.

> The database is a single SQLite file on the persistent disk (`/var/data`). Render snapshots it daily. Any host that runs Node and keeps files on disk works too (Railway, Fly.io, a VPS).

## 3. Turn on email alerts (Gmail)

1. Google Account → Security → turn on 2-Step Verification.
2. Search "App passwords" → create one → copy the 16-character code.
3. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<app password>`, `EMAIL_FROM=you@gmail.com`, `ALERT_EMAILS=you@gmail.com`.

## 4. Turn on text alerts + two-way texting (Twilio)

1. Sign up at twilio.com, buy a local 412 number (about $1.15/month plus about $0.008 per text).
2. Register the number for **A2P 10DLC** (required in the US for business texting; Twilio walks you through it).
3. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, and `ALERT_PHONES=+1412...` (your cell).
4. In Twilio → Phone Numbers → your number → **"A message comes in"** → Webhook, POST:
   `https://YOUR-BACKOFFICE-URL/api/twilio/sms`
   Customer replies now show up in the admin.

Then open **Admin → Alerts → Send test alert**.

## 5. Connect your website's quote form

**Option A: use this quote form (recommended).** Paste this where you want the form on pghshinepro.com:

```html
<div id="shinepro-quote"></div>
<script src="https://YOUR-BACKOFFICE-URL/embed.js" async></script>
```

Or just link your "Get a Quote" button to `https://YOUR-BACKOFFICE-URL/quote`.

**Option B: keep your existing form.** Point it at the lead API. An HTML form works as-is (it redirects to a thank-you page):

```html
<form method="POST" action="https://YOUR-BACKOFFICE-URL/api/leads">
  <input name="name" required> <input name="phone"> <input name="email">
  <select name="service_type"><option value="standard">Standard</option><option value="deep">Deep</option></select>
  <input name="bedrooms"> <input name="bathrooms"> <textarea name="message"></textarea>
  <input type="checkbox" name="marketing_opt_in" value="1"> Send me offers
  <button>Get quote</button>
</form>
```

Or send JSON with `fetch('/api/leads', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({...}) })`.
Fields: `name` (required), `phone` and/or `email` (at least one), `address`, `zip`, `service_type` (`standard|deep|move|airbnb|office`), `bedrooms`, `bathrooms`, `sqft`, `frequency` (`once|monthly|biweekly|weekly`), `preferred_date`, `message`, `marketing_opt_in`.

Make sure your website's address is in `ALLOWED_ORIGINS`.

## Change your prices

Edit `public/pricing.js`. The quote form and the server both use it, so the saved price always matches what the customer saw.

## Security built in

- Admin login uses a password with signed, HttpOnly session cookies. Login attempts are rate-limited.
- Quote form: spam honeypot, rate limit, input validation. The server recalculates prices, so they can't be faked.
- Twilio webhook signatures are verified. CSV export is protected against spreadsheet formula injection.

## Tests

```bash
npm test
```

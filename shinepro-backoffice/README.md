# Shine Pro Cleaning — Back Office

Lead capture + admin for **pghshinepro.com**. Nothing gets missed:

| Feature | What it does |
|---|---|
| **Instant quote form** | Visitors see their price live. Every submission is saved *first*, then alerts go out. |
| **New-lead alerts** | An email the moment someone requests a quote, with all their details and a link straight to the lead. Turn on Gmail notifications on your phone and it pops up like a text. Customer gets an automatic "we got your request" email showing your number (412) 447-8047. |
| **Leads pipeline** | New → Contacted → Quoted → Booked / Lost. Dashboard shows new leads first, with a red badge. |
| **Reply from admin** | **Email** customers straight from the lead page. For **texts**, press "Text via Google Voice": it copies your message and opens that customer's conversation in Google Voice (412) 447-8047. Paste, send, and the admin keeps a record. Quick-reply templates and private notes included. |
| **Customer replies** | Customer texts arrive in your Google Voice app. Use "Log customer's text reply" to save important ones on the lead so the full history is in one place. |
| **Clients** | Add, edit, search, delete. Every lead auto-creates/updates a client. Export all, or only the people who opted in to marketing, to CSV (for Mailchimp, etc.). |
| **Employees** | Add/edit cleaners, mark inactive, see each person's upcoming jobs. |
| **Bookings & calendar** | Book a job from a lead or client, assign one or more cleaners. Cleaners are emailed the date, address and notes automatically, and there's a one-tap "Text via Google Voice" button for each cleaner. Week calendar highlights jobs with no cleaner. |
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

## 4. Texting with Google Voice (412) 447-8047

Google Voice doesn't let other software send texts for you, so the admin works *with* your Google Voice app:

- **Replying:** choose "💬 Text via Google Voice", type your message, and press the button. Your message is copied and Google Voice opens on that customer's conversation. Paste it, send it, and the reply is saved in the admin.
- **Customer replies:** they arrive in the Google Voice app as usual. Use "📥 Log customer's text reply" to save them on the lead.
- **Instant lead alerts on your phone:** install the Gmail app and turn on notifications for the inbox in `ALERT_EMAILS`. Tip: in Gmail, make a filter for subjects containing "New quote request", mark it Important, and give it its own notification sound.
- Sign in to Google Voice on the same phone or computer you use for the admin, so the button opens the right account.

> Want fully automatic texts later (alerts to your cell, cleaners texted automatically)? That needs a texting service like Twilio. The code already supports it: fill in the `TWILIO_*` settings and it switches on.

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

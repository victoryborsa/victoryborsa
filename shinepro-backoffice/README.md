# Shine Pro Cleaning — Back Office

Lead capture, website chat and admin for **pghshinepro.com**. Built so no potential customer is missed.

**Web developer? Start with [DEVELOPER_HANDOFF.md](DEVELOPER_HANDOFF.md). The code to paste into the website is in [WEBSITE_SNIPPET.html](WEBSITE_SNIPPET.html).**

| Feature | What it does |
|---|---|
| **Website chat** | A "Chat With Us" button on every page. The customer types their name, email and phone, and you get an email right away. They can tap a **popular question** and get the answer instantly, or type their own: the **AI assistant** answers what they asked, asks one follow-up question at a time, and its answer appears word by word while it's still being written, so there's no long wait. "Urgent? Call or text (412) 447-8047" is always on screen, and they can tap **"Request a call back"**. You can also reply from the admin, and your reply appears in their chat window. |
| **Estimate requests** | The website's free estimate form sends each request here. The back office **prices it again itself** from `public/pricing.js` (a price changed in the browser is ignored) and saves the itemized estimate: the service, add-ons ("included" ones free), any recurring discount and exactly one **Travel Fee — $20** per visit. Custom-quote services (events, commercial, post-construction, upholstery, Airbnb 4+ bedrooms) are saved with no price. A double click or retry is saved once. Saved *first*, then alerts go out. |
| **Contact & newsletter** | The website's contact form becomes a lead (with an email to you and a confirmation to the customer). The newsletter sign-up adds the email to your clients with marketing turned on. Marketing is only ever turned on by the newsletter or the separate, unticked marketing checkbox, never by an estimate request. |
| **Website forms** | Event quotes, job applications, gift card orders, referrals and local area quotes land in Admin → **Website forms** (unread ones are marked) and email you. |
| **New-lead alerts** | An email the moment someone requests an estimate, starts a chat or asks for a call back, with a link straight to the lead. Estimate emails (yours and the customer's) list every line, the Travel Fee and the total, and say: "This is an estimate, not a booking. Your appointment is confirmed when we contact you to confirm the date and time." Turn on Gmail notifications on your phone and it pops up like a text. |
| **Leads pipeline** | New → Contacted → Quoted → Booked / Lost. Call-back requests are pinned to the top in red. |
| **Website chats** | **Pop-up alerts** (menu → Turn on pop-up alerts) play a chime and show a notification for new chats, leads and call-backs while the admin is open. Admin → **Chats** lists every website chat, newest first, with unread counts (also on the menu and dashboard) and a green dot when the customer is on the website right now. Open one to chat both ways (tap a quick reply or type): your reply appears in their chat window within seconds, and if they've left the website it's emailed to them too. While you're chatting, the AI assistant stays quiet for 30 minutes after your last reply and you get one email when they answer; press "Let the assistant answer again" to hand back. A closed chat button on the website changes to "New reply from us" when you write. |
| **Reply to customers** | Email directly from the admin. For texts, press "Text via Google Voice" (412) 447-8047: it copies your message and opens Google Voice. You can also reply into the website chat. Quick-reply templates and private notes are included. |
| **Clients** | Add, edit, search, delete. Every lead and chat creates or updates a client. Export everyone, or only people who agreed to receive offers, to CSV for marketing. |
| **Employees** | Add or edit cleaners, mark them inactive, see each person's jobs. |
| **Today screen** | Opens on today's cleanings in time order (with Directions, Call and Mark done), tomorrow's list, everything waiting on you (call-backs, chats, new leads, requests, bookings without a cleaner) and the week's bookings and money. On a phone the admin has a bottom bar: Today, Calendar, a big ＋ to book, Chats and More. |
| **Calendar & booking** | Day, week and month views, coloured by cleaner (tap a cleaner's name to show or hide them). Click an empty time to book it; drag a booking to another time or day to move it (you're asked whether to email the client). **Book a cleaning**: find the client by typing, or add a new one in the same form, pick a quick time, and choose **Repeat** (every week, 2 weeks, 4 weeks or month, 4 to 26 visits) to book them all at once. The client is **emailed a confirmation immediately** with a calendar file to add it to their phone, again if you move or cancel, and gets an **automatic reminder the day before** (from 10 AM; `REMINDERS=false` turns it off). "Cancel this and all later visits" ends a repeating booking with one email. You're warned (not blocked) if a cleaner already has a job then, and cleaners are emailed their jobs. |
| **Alerts log** | Every email and text is logged as sent, failed or skipped, with the number of tries. A failed one is **retried automatically** (3 tries in total, a few seconds apart) and never sent twice; press **Retry** to send it again. Each lead page shows what was sent about it. There's a "Send test alert" button and dashboard warnings if something isn't set up. |
| **Client portal** (`/portal`) | Your clients log in with their email and a password. They see their next cleaning, upcoming and past bookings (date, time, service, address, status, cleaner's first name), and can ask to **reschedule** or **cancel**, or **request a new cleaning**. They see their **invoices**, print them and press **Pay now**. They can update their phone, address and email preferences, and change their password. |
| **Host portal** (`/host`) | For Airbnb / short-term-rental owners. They add their **properties** (address, size, lockbox/door code, checkout and check-in times), **request turnovers**, see upcoming and past turnovers, and read each turnover's **report**: cleaning notes, damage, low supplies and photos. |
| **Requests inbox** | Every reschedule, cancel and turnover request lands in Admin → Requests and emails you. Approve it (the booking is moved, cancelled or created) or decline it with a note. The client gets an email either way. |
| **Invoices** | Create an invoice from a booking or a blank one. Invoices have **lines**: one from a booking starts with its service line and exactly one Travel Fee — $20 line (it can't be added twice), you can edit the lines, and the total is always their sum. Clients see every line in the portal and on the printable invoice. Mark it sent, paid or void, add a **Stripe Payment Link**, and email it to the client in one click. Clients never see drafts. |
| **Turnover reports** | On any booking, press "Report & photos" to write notes, damage and inventory, and upload photos from your phone. Only that host and you can see the photos. |

## Try it on your computer

Requires Node.js 22.13 or newer.

```bash
cd shinepro-backoffice
npm install
npm test
npm start
```
Open http://localhost:3000/admin (dev password: `changeme123`) and http://localhost:3000/quote.
The client portal is at http://localhost:3000/portal/login and the host portal at http://localhost:3000/host/login.

## Give a client access to the portal

1. Admin → **Clients** → open the client. They need an **email address** on their record (it becomes their login).
2. In the **Client portal** box press **Turn on & email link** (or **Turn on as host (Airbnb)** for a rental owner).
3. They get an email with a link to choose their password (it works once and expires in 72 hours). Lost it? Press **Email set-password link** again.

Clients can also sign themselves up at `/portal/register`, but only with an email that is already on a client record. The link always goes to that email, so nobody can see someone else's account. **Turn off access** logs them out right away.

## Invoices and online payment

1. Admin → **Invoices** → **New invoice**, or open a booking and press **Create invoice**.
2. To let the client pay by card, create a **Payment Link** in your Stripe dashboard (Payment Links → New, with the invoice amount) and paste it into **Pay link**.
3. Press **Save & email to client**. They get the amount, due date, the **Pay now** link and a link to view or print the invoice in their portal.
4. When Stripe shows the payment, press **Mark paid**. (The back office does not talk to Stripe directly, so this step is manual.)


To try only the chat: `npm run preview`, then open http://localhost:3000/chat-preview.html.

## Put it online

**On GoDaddy (the plan):** GoDaddy Node.js Hosting, included with GoDaddy Web Hosting (Economy or higher), on `admin.pghshinepro.com`.

1. `npm run package:godaddy` writes `shinepro-backoffice-godaddy.zip` (no `node_modules`, data or secrets).
2. Upload it as a new Node.js app and add its MySQL database.
3. Set `ADMIN_PASSWORD` (10+ characters). Optional: `ANTHROPIC_API_KEY` for AI chat answers, `EMAIL_REPLY_TO`, `ALERT_EMAILS` (defaults to pghshinepro@gmail.com), `PUBLIC_URL` (defaults to https://admin.pghshinepro.com).
4. Publish, then connect `admin.pghshinepro.com` to the app.

How it differs from other hosts, all automatic when GoDaddy's `DB_HOST` is present:
- GoDaddy wipes the app's disk on each deploy, so the database file and uploaded photos are copied to GoDaddy's MySQL within a few seconds of every change, and restored on start (`src/cloud-store.js`; the last 20 copies are kept). Run one copy of the app only.
- GoDaddy blocks SMTP, so email goes through GoDaddy's own mail service (`src/mail-gateway.js`): no Gmail app password. Replies go to `EMAIL_REPLY_TO`, or the first alert email.
- GoDaddy's mail service accepted our test emails but they never reached Gmail, so email goes through Brevo's web API instead once `BREVO_API_KEY` is set (`src/mail-brevo.js`, free for 300 emails a day). The sender is `EMAIL_FROM` (default `bookings@pghshinepro.com`), which must be on a domain verified in Brevo. The Alerts page shows which service is in use.
- To deploy from GitHub, point GoDaddy at this repository's root: the root `package.json` builds and starts this folder.
- The login-cookie secret is generated once and kept in MySQL unless `SESSION_SECRET` is set, and a default admin password is never used.

**Elsewhere:** see **DEVELOPER_HANDOFF.md**: Render.com (about $7/month) using the included `render.yaml`.

## Accounts you need

| For | Service | Cost (approx.) |
|---|---|---|
| Hosting | GoDaddy Web Hosting with Node.js Hosting (or Render.com, ~$7/month) | included in your GoDaddy plan |
| Email alerts + email codes | GoDaddy's mail service (or your Gmail with an App Password elsewhere) | free |
| Texting customers | Google Voice (412) 447-8047 | free (you already have it) |
| Phone verification codes in chat | Firebase Phone Authentication (Google) | free for small volumes, then a few cents per text (check Firebase pricing) |
| AI chat answers | Anthropic API key (console.anthropic.com) | pay per use, usually a few cents per conversation |

> Why Firebase for chat phone codes? A verification code has to be *sent automatically*, and Google Voice can't do that. Firebase is Google's service built for exactly this.

## Teach the chat assistant about your business

Edit **`knowledge.md`** in plain English: service area, hours, what's included, policies, add-ons. Lines marked `[CONFIRM]` are guesses you should check. The assistant only answers from this file and the prices in `public/pricing.js`. For anything else, it tells the customer a team member will follow up. The popular questions and their instant answers are in **`src/answers.js`**; keep them in line with `knowledge.md`. Restart the server after editing.

## Prices

**All prices live in one file: `public/pricing.js`.** It has the price per service and home size, what each service already includes, the add-ons, the recurring discounts and the $20 travel fee that is added once to every visit (never discounted). The website, the estimate widget, the back office (which re-prices every request it receives), invoices and the chat assistant all use it. To change a price, edit that file, rebuild the website and redeploy the back office. Nothing else needs to change.

## Texting with Google Voice

- **Replying:** choose "💬 Text via Google Voice", type your message, and press the button. Your message is copied and Google Voice opens on that customer's conversation. Paste, send, and the admin keeps a record.
- **Customer replies** arrive in your Google Voice app. Use "📥 Log customer's text reply" to save them on the lead.
- Sign in to Google Voice on the same phone or computer you use for the admin.

## Getting found on Google (SEO)

`SEO_KIT.md` is a step-by-step list for your developer, and for you (Google Business Profile, reviews). The chat reports every lead to Google Analytics so you can see what's working.

## Security built in

- Chat: email codes are 6 digits, expire in 10 minutes, can be used once, and lock after 5 wrong tries. Phone numbers are verified by Firebase, and the server checks Google's signature. Chats are rate-limited.
- Admin: password login with a signed, HttpOnly cookie. Login attempts are rate-limited, and forms are protected against cross-site requests.
- Portals: passwords are stored hashed (scrypt with a separate salt per person), never in plain text. Password links work once and expire. Logins are rate-limited. Every page only ever shows the logged-in client's own bookings, invoices, properties, reports and photos (this is tested). Changing a password logs out other devices.
- Website forms (estimate, contact, newsletter, other forms): spam honeypot, rate limit, validation, duplicate protection. The server recalculates every price.
- CSV export is protected against spreadsheet formula injection.

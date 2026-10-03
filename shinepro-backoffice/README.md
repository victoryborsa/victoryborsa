# Shine Pro Cleaning — Back Office

Lead capture, website chat and admin for **pghshinepro.com**. Built so no potential customer is missed.

**Web developer? Start with [DEVELOPER_HANDOFF.md](DEVELOPER_HANDOFF.md). The code to paste into the website is in [WEBSITE_SNIPPET.html](WEBSITE_SNIPPET.html).**

| Feature | What it does |
|---|---|
| **Website chat** | A "Chat With Us" window on every page. Before chatting, the customer confirms their **email** with a code we email them and their **phone** with a code we text them. Anyone who can't verify can't chat. The **AI assistant** answers questions about services and prices. The customer can tap **"Request a call back"** and leave a note, and you get an urgent email. You can also reply from the admin, and your reply appears in their chat window. |
| **Quote requests** | Your website's existing quote form (with your real prices) also sends each request here. It is saved *first*, then alerts go out. |
| **New-lead alerts** | An email the moment someone requests a quote, starts a chat or asks for a call back, with a link straight to the lead. Turn on Gmail notifications on your phone and it pops up like a text. |
| **Leads pipeline** | New → Contacted → Quoted → Booked / Lost. Call-back requests are pinned to the top in red. |
| **Reply to customers** | Email directly from the admin. For texts, press "Text via Google Voice" (412) 447-8047: it copies your message and opens Google Voice. You can also reply into the website chat. Quick-reply templates and private notes are included. |
| **Clients** | Add, edit, search, delete. Every lead and chat creates or updates a client. Export everyone, or only people who agreed to receive offers, to CSV for marketing. |
| **Employees** | Add or edit cleaners, mark them inactive, see each person's jobs. |
| **Bookings & calendar** | Book a job from a lead or client and assign cleaners. They're emailed the details, and each has a Google Voice text button. The week calendar highlights jobs with no cleaner. |
| **Alerts log** | Every email shows as sent or failed. There's a "Send test alert" button and dashboard warnings if something isn't set up. |
| **Client portal** (`/portal`) | Your clients log in with their email and a password. They see their next cleaning, upcoming and past bookings (date, time, service, address, status, cleaner's first name), and can ask to **reschedule** or **cancel**, or **request a new cleaning**. They see their **invoices**, print them and press **Pay now**. They can update their phone, address and email preferences, and change their password. |
| **Host portal** (`/host`) | For Airbnb / short-term-rental owners. They add their **properties** (address, size, lockbox/door code, checkout and check-in times), **request turnovers**, see upcoming and past turnovers, and read each turnover's **report**: cleaning notes, damage, low supplies and photos. |
| **Requests inbox** | Every reschedule, cancel and turnover request lands in Admin → Requests and emails you. Approve it (the booking is moved, cancelled or created) or decline it with a note. The client gets an email either way. |
| **Invoices** | Create an invoice from a booking (amount filled in) or a blank one. Mark it sent, paid or void, add a **Stripe Payment Link**, and email it to the client in one click. Clients never see drafts. |
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


## Put it online

See **DEVELOPER_HANDOFF.md**. In short: Render.com (about $7/month) using the included `render.yaml`, on `admin.pghshinepro.com`.

## Accounts you need

| For | Service | Cost (approx.) |
|---|---|---|
| Hosting | Render.com | ~$7/month |
| Email alerts + email codes | Your Gmail (App Password) | free |
| Texting customers | Google Voice (412) 447-8047 | free (you already have it) |
| Phone verification codes in chat | Firebase Phone Authentication (Google) | free for small volumes, then a few cents per text (check Firebase pricing) |
| AI chat answers | Anthropic API key (console.anthropic.com) | pay per use, usually a few cents per conversation |

> Why Firebase for chat phone codes? A verification code has to be *sent automatically*, and Google Voice can't do that. Firebase is Google's service built for exactly this.

## Teach the chat assistant about your business

Edit **`knowledge.md`** in plain English: service area, hours, what's included, policies, add-ons. Lines marked `[CONFIRM]` are guesses you should check. The assistant only answers from this file and the prices in `public/pricing.js`. For anything else, it tells the customer the team will follow up and suggests "Request a call back". Restart the server after editing.

## Prices

Your website's prices stay exactly as they are (`PRICE_SOURCE=site`, the default). Leads keep the price your website's form showed, and the chat assistant never quotes dollar amounts. It sends customers to your quote form or offers a call back. `public/pricing.js` holds sample prices that are only used if you switch to `PRICE_SOURCE=package`.

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
- Quote form: spam honeypot, rate limit, validation. The server recalculates prices.
- CSV export is protected against spreadsheet formula injection.

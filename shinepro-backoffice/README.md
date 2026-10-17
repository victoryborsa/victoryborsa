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
| **Reply to customers** | Email directly from the admin. For texts, press "Text via Google Voice" (412) 447-8047: it copies your message and opens Google Voice. You can also reply into the website chat. Quick-reply templates and private notes are included. |
| **Clients** | Add, edit, search, delete. Every lead and chat creates or updates a client. Export everyone, or only people who agreed to receive offers, to CSV for marketing. |
| **Employees** | Add or edit cleaners, mark them inactive, see each person's jobs. |
| **Bookings & calendar** | Book a job from a lead or client and assign cleaners. A booking made from a lead keeps its price and itemized estimate. You're warned (not blocked) if a cleaner already has a job at that time. Cleaners are emailed the details, and each has a Google Voice text button. The week calendar highlights jobs with no cleaner. |
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

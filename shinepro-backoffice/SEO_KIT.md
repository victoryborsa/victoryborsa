# SEO & Error-Free Website Kit — pghshinepro.com

Goal: more people find Shine Pro Cleaning on Google, the site has no errors, and every lead is tracked.
Work through this top to bottom. Items marked **[OWNER]** need a quick answer or action from the owner.

---

## 1. Installing this package will not hurt rankings (already handled)

- `chat.js` loads with `async`, sits in a fixed corner (no layout shift), and loads Firebase **only after** a visitor clicks "Start Chat". It doesn't slow the first page load.
- The back office (`admin.pghshinepro.com`) sends `X-Robots-Tag: noindex` on every response and serves a `robots.txt` that blocks crawling. It can never appear in Google or compete with the main site.
- **Check:** run https://pagespeed.web.dev on the home page **before and after** adding the chat. Scores should be about the same.

## 2. Find and fix existing website errors

| Tool | What to check | Target |
|---|---|---|
| Google Search Console → **Pages** | "Not indexed" reasons: 404, redirect errors, duplicate without canonical, crawled but not indexed | 0 errors on real pages |
| Search Console → **Core Web Vitals** and PageSpeed Insights (mobile) | LCP, INP, CLS | All "Good". Performance 90+ on mobile |
| Browser DevTools → **Console** on every page | JavaScript errors, failed requests (red) | None |
| https://validator.w3.org/checklink | Broken links and images | None |
| https://search.google.com/test/rich-results | The structured data from section 4 | Valid, no errors |
| Try `http://`, `https://`, `www.` and non-`www` versions of the site | All four should end on **one** address with a single 301 redirect | One canonical host |

## 3. Technical SEO checklist

- [ ] **The site's HTML contains the real text.** If the site is a React/Vite single-page app (it looks like one), Google may see an empty page or the same title on every page. Use pre-rendering or SSR (e.g. `vite-plugin-prerender`, `react-snap`, Next.js), or at minimum give each route its own title, description and canonical (e.g. `react-helmet-async`). **This is the most common reason sites like this don't rank.** Check with Search Console → URL Inspection → "View crawled page".
- [ ] Each page has a unique `<title>` (≤ 60 characters), a `<meta name="description">` (≤ 155 characters), exactly one `<h1>`, and `<link rel="canonical">`.
- [ ] `https://pghshinepro.com/sitemap.xml` lists every public page and is submitted in Search Console. Admin and customer-portal pages are **not** listed.
- [ ] `https://pghshinepro.com/robots.txt`:
  ```
  User-agent: *
  Disallow: /admin
  Disallow: /portal
  Sitemap: https://pghshinepro.com/sitemap.xml
  ```
  Adjust the paths to wherever the current site's back office and customer portal live. They should also send `noindex`.
- [ ] Every image has descriptive `alt` text (e.g. "Deep-cleaned kitchen in Pittsburgh home"). Images use WebP/AVIF, have width/height set, and load lazily below the fold.
- [ ] The site works well on phones: tap targets ≥ 44 px, no sideways scrolling, and a click-to-call link for `tel:+14124478047` in the header.
- [ ] A custom 404 page that links to Home and the quote form.
- [ ] Open Graph tags (`og:title`, `og:description`, `og:image`) so shared links look good on Facebook and in texts.

## 4. Structured data (add to the home page `<head>`)

This helps Google show the business with its phone number and service area. **[OWNER]** Confirm the hours and service area. Don't add a street address unless customers visit it.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HouseCleaningService",
  "name": "Shine Pro Cleaning",
  "url": "https://pghshinepro.com",
  "logo": "https://pghshinepro.com/logo.png",
  "image": "https://pghshinepro.com/logo.png",
  "telephone": "+1-412-447-8047",
  "areaServed": [
    { "@type": "City", "name": "Pittsburgh, PA" }
  ],
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Pittsburgh",
    "addressRegion": "PA",
    "addressCountry": "US"
  },
  "openingHoursSpecification": [{
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
    "opens": "08:00",
    "closes": "18:00"
  }],
  "sameAs": [
    "https://www.facebook.com/YOUR-PAGE",
    "https://www.instagram.com/YOUR-PAGE"
  ]
}
</script>
```
Replace the logo path and the social links with real ones, or delete `sameAs`. Only add `aggregateRating` if it shows real reviews that appear on the site itself.

## 5. Page titles & descriptions (suggested)

| Page | Title | Meta description |
|---|---|---|
| Home | House Cleaning Pittsburgh \| Shine Pro Cleaning | Trusted house cleaning in Pittsburgh. Standard, deep, move-in/out & Airbnb cleaning. Get an instant quote online or call (412) 447-8047. |
| Deep cleaning | Deep Cleaning Services in Pittsburgh \| Shine Pro | Top-to-bottom deep cleaning for Pittsburgh homes: baseboards, kitchens, bathrooms and more. See your price instantly. |
| Move in/out | Move-In & Move-Out Cleaning Pittsburgh \| Shine Pro | Move-out or move-in cleaning in Pittsburgh. Leave your place spotless. Instant online quote. |
| Airbnb | Airbnb & Rental Turnover Cleaning Pittsburgh | Fast, reliable turnover cleaning between guests for Pittsburgh short-term rentals. |
| Quote | Get an Instant Cleaning Quote \| Shine Pro Cleaning | Answer a few questions and see your cleaning price in seconds. No account needed. |
| Contact | Contact Shine Pro Cleaning \| (412) 447-8047 | Call or text (412) 447-8047, chat with us, or request a quote online. |

**Content that brings leads:** give each service its own page with 300+ words of real detail (what's included, a checklist, FAQs, photos) and a quote button above the fold. Add an FAQ section, which can use `FAQPage` structured data. If you serve specific neighborhoods (Squirrel Hill, Shadyside, Mt. Lebanon, etc.), a page per area is fine only with genuinely unique content. **[OWNER]** Which areas do you serve?

## 6. Google Business Profile (biggest source of local leads) — [OWNER]

1. Claim or verify the profile at https://business.google.com as a **service-area business** (hides the home address).
2. Primary category: **House cleaning service**. Add other categories that fit, like Commercial cleaning service or Janitorial service.
3. Use the same name, phone `(412) 447-8047` and website **exactly** as on the site (this is called NAP consistency). Use the same details on Yelp, Facebook, Nextdoor, Angi and Thumbtack.
4. Add real photos, services with descriptions, and the service area. Post an update or offer weekly.
5. **Reviews:** after each finished job, send the customer your Google review link. You can send it from the admin: open the client and email or text them. Reply to every review.

## 7. Track every lead (Google Analytics 4 / Google Ads / Meta)

This package already sends these events if GA4 (`gtag`), Google Tag Manager (`dataLayer`) or the Meta Pixel is on the site:

| Event | When |
|---|---|
| `generate_lead` with `lead_source: chat_started` (GTM: `shinepro_chat_started`) | A customer verified their email and phone and started a chat |
| `generate_lead` with `lead_source: callback_request` (GTM: `shinepro_callback_request`) | A customer asked for a call back |
| Meta `Lead` | Both of the above |

Also:
- [ ] Fire `generate_lead` when the site's own quote form submits successfully.
- [ ] Track clicks on the `tel:` link.
- [ ] In GA4, go to Admin → Events and mark `generate_lead` as a **key event**. Link GA4 to Google Ads and Search Console.

## 8. Done when

- [ ] Search Console shows no page errors, and the sitemap status is "Success"
- [ ] PageSpeed (mobile) is 90+ and Core Web Vitals are "Good"
- [ ] The Rich Results Test is valid for HouseCleaningService
- [ ] There are no console errors on any page, and no broken links
- [ ] A test chat and a test quote both show in GA4 Realtime as `generate_lead`
- [ ] The Google Business Profile is verified and uses the same name, phone and website as the site

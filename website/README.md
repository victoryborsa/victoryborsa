# PGH Shine Pro website

A fast, mobile-friendly website for PGH Shine Pro Cleaning Services. It builds to plain HTML, CSS and JavaScript files, so it runs on any basic web hosting, including GoDaddy.

## What's in it

- **Home page** (`index.html`): instant price calculator, services, how it works, pricing by home size, what's included, reviews, the Shine Guarantee, service-area checker, FAQ and a contact form.
- **Booking page** (`book.html`): a 5-step booking request (service, date and arrival window, address with autocomplete, contact details, review) with a live price summary.
- **404 page**, `robots.txt`, `sitemap.xml`, a social sharing image and an `.htaccess` file for GoDaddy.

## Change prices, phone, email or discounts

Everything you are likely to change is in one file: `src/public/assets/js/config.js` (or `assets/js/config.js` in the uploaded site). Edit the numbers or text, rebuild, and upload again.

## Get booking requests in your inbox

By default, booking and contact requests open the visitor's email app with everything filled in. To receive them automatically instead:

1. Create a free form at [formspree.io](https://formspree.io) using your business email.
2. Copy its endpoint, e.g. `https://formspree.io/f/abcdwxyz`.
3. Paste it into `formEndpoint` in `config.js`, rebuild, and upload.

## Build

Requires Node.js 18 or newer. No packages to install.

```sh
npm run build        # writes dist/ and pghshinepro-website.zip
npm run preview      # builds and serves it at http://localhost:8080
npm run screenshots  # desktop and phone screenshots into screenshots/ (needs Playwright)
```

## Put it on GoDaddy

1. Run `npm run build` (or use the `pghshinepro-website.zip` you were sent).
2. In GoDaddy, open **My Products → Web Hosting → Manage → cPanel Admin → File Manager**.
3. Open the `public_html` folder. Back up and remove the old site files there.
4. Click **Upload**, choose `pghshinepro-website.zip`, then right-click it and choose **Extract**. `index.html` should sit directly inside `public_html`.
5. Turn on **Show Hidden Files** in File Manager settings to confirm `.htaccess` was extracted.
6. Visit pghshinepro.com. If you don't have an SSL certificate yet, remove the `RewriteRule` lines in `.htaccess` that force `https://`.

Your domain must point to GoDaddy hosting (not to your current website platform) for the new site to show.

## Address autocomplete

Address suggestions come from [Photon](https://photon.komoot.io), a free OpenStreetMap service with no API key, biased to the Pittsburgh area. After a visitor picks an address, the site checks whether it is within the 20-mile service radius of Downtown.

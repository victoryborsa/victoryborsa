# PGH Shine Pro website

A fast, mobile-friendly website for PGH Shine Pro Cleaning Services. It builds to plain HTML, CSS and JavaScript files, so it runs on any basic web hosting, including GoDaddy.

## What's in it

A page-for-page rebuild of the current pghshinepro.com, at the same web addresses (`/services`, `/house-cleaning`, `/free-estimate`, ...), so existing links and Google results keep working.

- `src/pages/`: one file per page. The comment at the top holds the page's address, title and description.
- `src/partials/`: pieces shared by every page (header, footer, mobile action bar, icons).
- `src/public/`: CSS, JavaScript, fonts, images, `robots.txt` and the `.htaccess` file for GoDaddy.
- Forms (free estimate, contact, careers, event, specialty and local quotes, gift cards, newsletter) are saved in the back office when `backofficeUrl` is set in `config.js`; otherwise they go to `formEndpoint`, or open the visitor's email app.

The client portal (`/portal/...`), host portal (`/host/...`) and admin dashboard need a server and database, so they run in the back office app (`shinepro-backoffice/`, planned at admin.pghshinepro.com). `.htaccess` forwards `/portal` and `/host` there; change that address if the back office lives elsewhere.

The 24 local pages (`/cleaning-services/...`) are generated: edit `scripts/neighborhood-pages.mjs`, run it, then build.

## Change prices, discounts, the travel fee, hours or service radius

All of these live in one file shared with the back office: `../shinepro-backoffice/public/pricing.js`. Edit it, rebuild the website and redeploy the back office; every page, the estimate calculator, the server's price check, emails and invoices then show the same numbers.

Pages never type a price. They use tokens that the build fills in from that file, for example `{{price deep 2}}` ($309), `{{from airbnb}}` ($95), `{{addon fridge}}`, `{{off weekly}}` (15%), `{{travel}}` ($20) and `{{biz hours}}`. The build stops with an error if a token names something that doesn't exist.

Phone, email, gift card links and where forms are sent are in `src/public/assets/js/config.js`.

## Get form requests in your inbox

With the back office running, set `backofficeUrl` in `config.js` (e.g. `https://admin.pghshinepro.com`) and every request is saved there, checked against the price list, and emailed to you and the customer. Without it, by default, estimate and contact requests open the visitor's email app with everything filled in. To receive them automatically instead:

1. Create a free form at [formspree.io](https://formspree.io) using your business email.
2. Copy its endpoint, e.g. `https://formspree.io/f/abcdwxyz`.
3. Paste it into `formEndpoint` in `config.js`, rebuild, and upload.

## Build

Requires Node.js 18 or newer. No packages to install.

```sh
npm run build        # writes dist/ and pghshinepro-website.zip
npm run preview      # builds and serves it at http://localhost:8080
node build.mjs --preview  # writes dist-preview/, which opens straight from the files (no server)
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

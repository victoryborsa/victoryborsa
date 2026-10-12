// Writes the 24 local pages (/cleaning-services/<area>) into src/pages.
// Edit the area list or the template below, then run:
//   node scripts/neighborhood-pages.mjs && node build.mjs
import { writeFileSync } from "node:fs";

const pages = new URL("../src/pages/", import.meta.url).pathname;

// [name, slug, kind, short local description]
const areas = [
  ["Shadyside", "shadyside", "neighborhood", "House cleaning, deep cleaning, apartment cleaning and Airbnb turnovers in Shadyside."],
  ["Squirrel Hill", "squirrel-hill", "neighborhood", "Professional house cleaning and recurring cleaning in Squirrel Hill, Pittsburgh, PA."],
  ["Strip District", "strip-district", "neighborhood", "Apartment, condo and Airbnb turnover cleaning in the Strip District."],
  ["Lawrenceville", "lawrenceville", "neighborhood", "House cleaning, move-out cleaning and Airbnb turnovers in Lawrenceville."],
  ["East Liberty", "east-liberty", "neighborhood", "House, apartment and deep cleaning in East Liberty."],
  ["Bloomfield", "bloomfield", "neighborhood", "House cleaning, deep cleaning and move-in/move-out cleaning in Bloomfield."],
  ["Oakland", "oakland", "neighborhood", "Apartment cleaning, move-out cleaning and office cleaning in Oakland."],
  ["Greenfield", "greenfield", "neighborhood", "House cleaning and recurring maid service in Greenfield."],
  ["Highland Park", "highland-park", "neighborhood", "House cleaning, deep cleaning and recurring cleaning in Highland Park."],
  ["Downtown Pittsburgh", "downtown-pittsburgh", "neighborhood", "Condo, apartment, Airbnb and office cleaning in Downtown Pittsburgh."],
  ["South Side", "south-side", "neighborhood", "House cleaning, apartment cleaning and Airbnb turnovers on the South Side."],
  ["Mount Washington", "mount-washington", "neighborhood", "House cleaning, deep cleaning and Airbnb turnovers in Mount Washington."],
  ["Bethel Park", "bethel-park", "suburb", "House cleaning, deep cleaning, and maid service in Bethel Park, PA."],
  ["Mount Lebanon", "mount-lebanon", "suburb", "House cleaning, deep cleaning, and maid service in Mount Lebanon, PA."],
  ["Monroeville", "monroeville", "suburb", "House cleaning, deep cleaning, and maid service in Monroeville, PA."],
  ["Wexford", "wexford", "suburb", "Residential cleaning and recurring maid service in Wexford, PA."],
  ["Cranberry Township", "cranberry-township", "suburb", "Residential cleaning and recurring maid service in Cranberry Township, PA."],
  ["Sewickley", "sewickley", "suburb", "Professional house cleaning and deep cleaning in Sewickley, PA."],
  ["North Hills", "north-hills", "suburb", "Residential cleaning and Airbnb turnover cleaning in North Hills, PA."],
  ["Bellevue", "bellevue", "suburb", "Professional house cleaning and deep cleaning in Bellevue, PA."],
  ["Penn Hills", "penn-hills", "suburb", "House cleaning and maid service in Penn Hills, PA."],
  ["Robinson Township", "robinson-township", "suburb", "House cleaning, deep cleaning, and move-in/move-out cleaning in Robinson Township, PA."],
  ["Irwin", "irwin", "suburb", "Residential cleaning and move-in/move-out cleaning in Irwin, PA."],
  ["Washington", "washington", "suburb", "House cleaning and maid service in Washington, PA."]
];

const icon = (id) => `<svg class="icon icon-sm" aria-hidden="true"><use href="#${id}" /></svg>`;

function page([name, slug, kind, blurb], i) {
  const place = kind === "suburb" ? `${name}, PA` : `${name}, Pittsburgh`;
  const nearby = areas
    .filter((a) => a[2] === kind && a[1] !== slug)
    .slice(0, 8)
    .map((a) => `<li><a href="/cleaning-services/${a[1]}">${a[0]}</a></li>`)
    .join("");
  const city = encodeURIComponent(name);
  return `<!--page {
  "path": "/cleaning-services/${slug}",
  "title": "House Cleaning in ${place} | PGH Shine Pro",
  "description": "${blurb} Insured, background-checked cleaners, supplies included. Standard clean from $149. Free estimate.",
  "scripts": ["forms.js"]
} -->
<section class="page-hero page-hero-plain">
  <div class="wrap two-col">
    <div>
      <span class="eyebrow">Cleaning services · ${name}</span>
      <h1>House cleaning in ${place}</h1>
      <p class="lead">${blurb} Insured, background-checked cleaners. Supplies included.</p>
      <div class="hero-ctas">
        <a class="btn btn-primary" href="/free-estimate?city=${city}">Get a Free Estimate</a>
        <a class="btn btn-ghost" href="tel:+14124478047">${icon("i-phone")} Call (412) 447-8047</a>
      </div>
      <!-- @include trust3 -->
    </div>
    <div class="price-table-card">
      <h2 class="list-title">${name} pricing — Standard Clean</h2>
      <ul class="price-rows">
        <li><span>1 Bedroom</span><span class="amt">$149</span></li>
        <li><span>2 Bedrooms</span><span class="amt">$189</span></li>
        <li><span>3 Bedrooms</span><span class="amt">$229</span></li>
        <li><span>4 Bedrooms</span><span class="amt">$269</span></li>
        <li><span>5+ Bedrooms</span><span class="amt">$319</span></li>
      </ul>
      <p class="small-muted">Deep clean from $249 · Move-in/out from $299 · Airbnb turnover from $95. <a href="/services">All prices</a></p>
    </div>
  </div>
</section>

<section class="section steps-section">
  <div class="wrap">
    <div class="section-head reveal"><h2>Cleaning services in ${name}</h2></div>
    <div class="link-tiles reveal">
      <a href="/house-cleaning">House Cleaning</a><a href="/deep-cleaning">Deep Cleaning</a><a href="/move-in-out-cleaning">Move-In / Move-Out Cleaning</a><a href="/airbnb-cleaning">Airbnb Turnover Cleaning</a><a href="/apartment-condo-cleaning">Apartment &amp; Condo Cleaning</a><a href="/house-cleaning">Recurring Maid Service</a>
    </div>
  </div>
</section>

<section class="section" id="local-quote">
  <div class="wrap two-col">
    <div class="reveal">
      <h2>Get a quote in ${name}</h2>
      <p class="lead">Tell us about your home and we'll send your personalized quote, usually the same day. No payment required.</p>
      <ul class="check-list check-list-plain" style="margin-top:20px">
        <li>Flat-rate pricing — no hidden fees</li>
        <li>Weekly 15% off, biweekly 10% off, monthly 5% off</li>
        <li>Not right? Tell us within 24 hours and we come back and re-clean it free</li>
      </ul>
      <div class="side-call" style="margin-top:24px"><strong>Already a client?</strong><span>Log in to see your bookings, invoices, profile and scheduling options.</span><a class="link-arrow" href="/portal/login">Client Login ${icon("i-arrow")}</a></div>
    </div>
    <form class="form-card reveal" data-form="Quote request (${name})" novalidate>
      <div class="form-body">
        <input type="hidden" name="Area" value="${name}" />
        <div class="form-grid">
          <div class="field"><label for="n-name">Name *</label><input class="input" id="n-name" name="Name" autocomplete="name" required /><span class="field-error">Please enter your name.</span></div>
          <div class="field"><label for="n-phone">Phone *</label><input class="input" id="n-phone" name="Phone" type="tel" autocomplete="tel" required /><span class="field-error">Please enter a 10-digit phone number.</span></div>
          <div class="field full"><label for="n-email">Email *</label><input class="input" id="n-email" name="Email" type="email" autocomplete="email" required /><span class="field-error">Please enter a valid email.</span></div>
          <div class="field"><label for="n-service">Service</label><select class="select" id="n-service" name="Service"><option>Standard Cleaning</option><option>Deep Cleaning</option><option>Move-In / Move-Out</option><option>Recurring Cleaning</option><option>Apartment Cleaning</option><option>Airbnb Turnovers</option></select></div>
          <div class="field"><label for="n-beds">Bedrooms</label><select class="select" id="n-beds" name="Bedrooms"><option>1 Bedroom</option><option selected>2 Bedrooms</option><option>3 Bedrooms</option><option>4 Bedrooms</option><option>5+ Bedrooms</option></select></div>
          <div class="field full"><label for="n-msg">Address or notes <span class="opt">(optional)</span></label><textarea class="textarea" id="n-msg" name="Notes"></textarea></div>
        </div>
        <button class="btn btn-primary btn-block" type="submit">Get My Free Quote</button>
      </div>
      <!-- @include form-success -->
    </form>
  </div>
</section>

<section class="section" style="padding-top:0">
  <div class="wrap">
    <div class="section-head reveal"><h2>Nearby areas we serve</h2></div>
    <ul class="chips chips-links reveal">${nearby}<li><a href="/service-areas">All service areas</a></li></ul>
  </div>
</section>

<section class="section final-cta" style="padding-top:0">
  <div class="wrap">
    <div class="guarantee reveal">
      <div><h2>Ready for a cleaner home in ${name}?</h2><p>Get a free quote in minutes. Insured, background-checked, and supplies included.</p></div>
      <div class="final-cta-actions"><a class="btn btn-light" href="/free-estimate?city=${city}">Get a Free Quote</a><a class="btn btn-outline-light" href="tel:+14124478047">Call (412) 447-8047</a></div>
    </div>
  </div>
</section>
`;
}

areas.forEach((a, i) => writeFileSync(pages + `cleaning-services-${a[1]}.html`, page(a, i)));
console.log(`Wrote ${areas.length} local pages`);

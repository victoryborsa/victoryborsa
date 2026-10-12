/*
  PGH Shine Pro site settings.
  Edit the values below to change prices, contact details, or where form
  requests are sent. No other file needs to change.
*/
window.SHINE = {
  phone: "(412) 447-8047",
  phoneHref: "+14124478047",
  email: "pghshinepro@gmail.com",

  // Address of the PGH Shine Pro back office (e.g. "https://admin.pghshinepro.com").
  // When set, every estimate, message, form and newsletter signup is saved there:
  // it checks the price, alerts you, confirms to the customer and keeps a log.
  backofficeUrl: "",

  // Used only while backofficeUrl is empty.
  // Leave empty to open the visitor's email app with the request filled in.
  // For requests that arrive in your inbox automatically, create a free form at
  // https://formspree.io, then paste its endpoint here, e.g.
  // "https://formspree.io/f/abcdwxyz".
  formEndpoint: "",

  // What the "Chat With Us" button does. Leave empty to open a text message
  // to the phone number above; or paste a chat link (e.g. your chat widget page).
  chatUrl: "",

  // Home base for the service-area check (Downtown Pittsburgh).
  base: { lat: 40.4406, lon: -79.9959 },

  // Prices, add-ons, recurring discounts, the travel fee, hours and the
  // service radius are NOT set here. They live in one file shared with the
  // back office: shinepro-backoffice/public/pricing.js. Change them there and
  // rebuild; every page, form and invoice follows.

  // Gift card checkout. In Stripe, create a Payment Link for each amount
  // (Stripe dashboard > Payment Links > New) and paste each link here, e.g.
  // "$100": "https://buy.stripe.com/abc123". Buyers then pay by card on Stripe's
  // secure page. While a link is empty, the order is sent to you instead.
  giftCardLinks: {
    "$50": "",
    "$75": "",
    "$100": "",
    "$150": "",
    "$200": "",
    "$250": ""
  },

  // ZIP check: any ZIP starting with these digits counts as served, plus the
  // extra ZIPs listed (Washington, Irwin, Cranberry Township).
  zipPrefixes: ["150", "151", "152"],
  extraZips: ["15301", "15642", "16066"]
};

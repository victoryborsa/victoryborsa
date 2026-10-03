/*
  PGH Shine Pro site settings.
  Edit the values below to change prices, contact details, or where form
  requests are sent. No other file needs to change.
*/
window.SHINE = {
  phone: "(412) 447-8047",
  phoneHref: "+14124478047",
  email: "pghshinepro@gmail.com",

  // Where estimate, contact, careers, event and gift card requests go.
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
  serviceRadiusMiles: 20,

  // Home sizes. Prices for each service are listed in the same order.
  sizes: [
    { id: "1", label: "Studio / 1 bedroom" },
    { id: "2", label: "2 bedrooms" },
    { id: "3", label: "3 bedrooms" },
    { id: "4", label: "4 bedrooms" },
    { id: "5", label: "5+ bedrooms" }
  ],

  // Price per size (same order as sizes). null = "Custom quote".
  services: [
    { id: "standard", label: "House cleaning", prices: [149, 189, 229, 269, 319] },
    { id: "deep", label: "Deep cleaning", prices: [249, 309, 359, 419, 489] },
    { id: "move", label: "Move-in / move-out", prices: [299, 359, 429, 499, 579] },
    { id: "recurring", label: "Recurring cleaning", prices: [149, 189, 229, 269, 319], recurring: true, hidden: true },
    { id: "airbnb", label: "Airbnb turnover", prices: [95, 125, 155, null, null], unit: "per turn" },
    { id: "apartment", label: "Apartment & condo", prices: [149, 189, 229, 269, 319] },
    { id: "event", label: "Event cleanup", quoteOnly: true }
  ],

  // Recurring discount per visit (0.10 = 10% off).
  frequencies: [
    { id: "weekly", label: "Weekly", discount: 0.15 },
    { id: "biweekly", label: "Every 2 weeks", discount: 0.1 },
    { id: "monthly", label: "Monthly", discount: 0.05 }
  ],

  // Add-ons offered on the estimate form.
  addons: [
    { id: "fridge", label: "Inside fridge", price: "+$35" },
    { id: "oven", label: "Inside oven", price: "+$35" },
    { id: "windows", label: "Interior windows", price: "+$40" },
    { id: "laundry", label: "Laundry", price: "+$25" },
    { id: "cabinets", label: "Inside cabinets", price: "+$55" },
    { id: "organizing", label: "Organizing", price: "+$50/hr" },
    { id: "walls", label: "Walls", price: "+$110" },
    { id: "balcony", label: "Balcony", price: "+$45" },
    { id: "dishes", label: "Dishes", price: "+$30" }
  ],

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

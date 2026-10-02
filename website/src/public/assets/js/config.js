/*
  PGH Shine Pro site settings.
  Edit the values below to change prices, contact details, or where booking
  requests are sent. No other file needs to change.
*/
window.SHINE = {
  phone: "(412) 447-8047",
  phoneHref: "+14124478047",
  email: "info@pghshinepro.com",

  // Where booking and contact requests go.
  // Leave empty to open the visitor's email app with the request filled in.
  // For requests that arrive in your inbox automatically, create a free form at
  // https://formspree.io, then paste its endpoint here, e.g.
  // "https://formspree.io/f/abcdwxyz".
  formEndpoint: "",

  // Home base for the service-area check (Downtown Pittsburgh).
  base: { lat: 40.4406, lon: -79.9959 },
  serviceRadiusMiles: 20,

  // Starting price by home size for a standard house cleaning.
  sizes: [
    { id: "1", label: "Studio / 1 bedroom", price: 149 },
    { id: "2", label: "2 bedrooms", price: 189 },
    { id: "3", label: "3 bedrooms", price: 229 },
    { id: "4", label: "4 bedrooms", price: 269 },
    { id: "5", label: "5+ bedrooms", price: 319 }
  ],

  // Each service adds a flat amount on top of the home-size price.
  // quoteOnly services show "Custom quote" instead of a number.
  services: [
    { id: "standard", label: "House cleaning", add: 0, from: 149 },
    { id: "deep", label: "Deep cleaning", add: 100, from: 249 },
    { id: "move", label: "Move-in / move-out", add: 150, from: 299 },
    { id: "airbnb", label: "Airbnb turnover", add: -54, from: 95 },
    { id: "apartment", label: "Apartment & condo", add: 0, from: 149 },
    { id: "event", label: "Event cleanup", quoteOnly: true }
  ],

  // Recurring discount per visit (0.10 = 10% off). Set to 0 to turn off.
  frequencies: [
    { id: "once", label: "One time", discount: 0 },
    { id: "weekly", label: "Weekly", discount: 0.15 },
    { id: "biweekly", label: "Every 2 weeks", discount: 0.1 },
    { id: "monthly", label: "Monthly", discount: 0.05 }
  ],

  // Arrival windows offered on the booking page (Mon to Sat).
  arrivalWindows: ["8 – 10 am", "10 am – 12 pm", "12 – 2 pm", "2 – 4 pm"]
};

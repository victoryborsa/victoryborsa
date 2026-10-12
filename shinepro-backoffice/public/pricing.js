// PGH Shine Pro price list and calculator. THE one place prices live.
//
// Used by: the website (every price shown on every page, the instant estimate
// and the free estimate form — the website build copies this file in), and the
// back office server (it recalculates every estimate it receives, so a price
// typed or changed in the browser is never trusted), invoices and the chat.
//
// To change a price, edit it here, then rebuild the website and redeploy the
// back office. Nothing else needs to change.
(function (root) {
  const PRICING = {
    // Added once to every cleaning visit, for every service, including each
    // recurring visit. Never discounted.
    travelFee: 20,
    travelFeeLabel: 'Travel Fee',

    // Home sizes. Each service lists one price per size, in this order.
    sizes: [
      { id: '1', label: 'Studio / 1 bedroom', short: '1 Bedroom' },
      { id: '2', label: '2 bedrooms', short: '2 Bedrooms' },
      { id: '3', label: '3 bedrooms', short: '3 Bedrooms' },
      { id: '4', label: '4 bedrooms', short: '4 Bedrooms' },
      { id: '5', label: '5+ bedrooms', short: '5+ Bedrooms' },
    ],

    // prices: one per size; null means "custom quote" for that size.
    // included: add-ons that are already part of the service. They are shown
    //   as "Included" and never charged again.
    // quoteOnly: no online price; the team sends a personalized quote.
    services: {
      standard: { label: 'Standard Cleaning', prices: [149, 189, 229, 269, 319], included: [] },
      deep: { label: 'Deep Cleaning', prices: [249, 309, 359, 419, 489], included: ['fridge', 'oven', 'cabinets', 'windows'] },
      move: { label: 'Move-In / Move-Out', prices: [299, 359, 429, 499, 579], included: ['fridge', 'oven', 'cabinets', 'windows'] },
      recurring: { label: 'Recurring Cleaning', prices: [149, 189, 229, 269, 319], included: [], recurring: true },
      apartment: { label: 'Apartment Cleaning', prices: [149, 189, 229, 269, 319], included: [] },
      airbnb: { label: 'Airbnb Turnover', prices: [95, 125, 155, null, null], included: [], unit: 'turn' },
      event: { label: 'Event Cleanup', quoteOnly: true },
      commercial: { label: 'Commercial Cleaning', quoteOnly: true },
      postconstruction: { label: 'Post-Construction Cleaning', quoteOnly: true },
      upholstery: { label: 'Upholstery Cleaning', quoteOnly: true },
    },

    // Optional extras. perHour: price is per hour (hours chosen on the form).
    addons: [
      { id: 'fridge', label: 'Inside refrigerator', price: 35 },
      { id: 'oven', label: 'Inside oven', price: 35 },
      { id: 'windows', label: 'Interior windows', price: 40 },
      { id: 'laundry', label: 'One laundry load', price: 25 },
      { id: 'cabinets', label: 'Inside cabinets', price: 55 },
      { id: 'organizing', label: 'Organizing', price: 50, perHour: true },
      { id: 'walls', label: 'Walls', price: 110 },
      { id: 'balcony', label: 'Balcony', price: 45 },
      { id: 'dishes', label: 'Dishes', price: 30 },
    ],

    // Recurring discounts, taken off the cleaning price (not add-ons, not the travel fee).
    frequency: {
      once: { label: 'One time', discount: 0 },
      weekly: { label: 'Weekly', discount: 0.15 },
      biweekly: { label: 'Every 2 weeks', discount: 0.1 },
      monthly: { label: 'Monthly', discount: 0.05 },
    },

    business: {
      name: 'PGH Shine Pro Cleaning Services',
      phone: '(412) 447-8047',
      phoneHref: '+14124478047',
      email: 'pghshinepro@gmail.com',
      hours: 'Mon–Sat, 8am–6pm',
      hoursLong: 'Monday–Saturday, 8 AM–6 PM',
      radiusMiles: 20,
    },
  };

  const money = (n) => '$' + Number(n).toLocaleString('en-US');
  const sizeIndex = (id) => {
    const i = PRICING.sizes.findIndex((s) => s.id === String(id));
    return i === -1 ? null : i;
  };

  // Turns a request into an itemized estimate.
  // input: { service, size, frequency, addons: ['fridge', ...], organizingHours }
  // (service_type and bedrooms are accepted as aliases for service and size.)
  // Returns null for an unknown service, or
  // { service, quoteOnly, lines: [{ kind, label, amount }], subtotal, discount,
  //   travelFee, total, needsFrequency }
  // where kind is 'service' | 'addon' | 'included' | 'discount' | 'travel'.
  function quote(input) {
    input = input || {};
    const serviceId = input.service || input.service_type;
    const service = PRICING.services[serviceId];
    if (!service) return null;
    const travel = { kind: 'travel', label: `${PRICING.travelFeeLabel} — ${money(PRICING.travelFee)}`, amount: PRICING.travelFee };
    const base = { service: serviceId, label: service.label, lines: [], travelFee: PRICING.travelFee };
    if (service.quoteOnly) return Object.assign(base, { quoteOnly: true, lines: [travel], subtotal: null, discount: 0, total: null });

    let size = input.size != null ? input.size : input.bedrooms;
    if (Number(size) > 5) size = 5;
    const i = sizeIndex(size == null || size === '' ? '1' : Math.max(1, Math.round(Number(size) || 1)));
    const price = i == null ? null : service.prices[i];
    if (price == null) return Object.assign(base, { quoteOnly: true, lines: [travel], subtotal: null, discount: 0, total: null });

    const lines = [{ kind: 'service', label: `${service.label} — ${PRICING.sizes[i].short}`, amount: price }];
    const picked = Array.isArray(input.addons) ? input.addons : String(input.addons || '').split(',').map((s) => s.trim()).filter(Boolean);
    const seen = {};
    let addonTotal = 0;
    PRICING.addons.forEach((a) => {
      if (picked.indexOf(a.id) === -1 || seen[a.id]) return;
      seen[a.id] = true;
      if (service.included.indexOf(a.id) !== -1) {
        lines.push({ kind: 'included', label: `${a.label} — included`, amount: 0 });
        return;
      }
      let amount = a.price;
      let label = a.label;
      if (a.perHour) {
        const hours = Math.max(1, Math.min(8, Math.round(Number(input.organizingHours) || 1)));
        amount = a.price * hours;
        label = `${a.label} — ${hours} hr × ${money(a.price)}`;
      }
      addonTotal += amount;
      lines.push({ kind: 'addon', label, amount });
    });

    const freqId = service.recurring ? input.frequency : 'once';
    const freq = PRICING.frequency[freqId] || PRICING.frequency.once;
    const discount = Math.round(price * freq.discount);
    if (discount) lines.push({ kind: 'discount', label: `${freq.label} discount (${Math.round(freq.discount * 100)}% off cleaning)`, amount: -discount });
    lines.push(travel);

    const subtotal = price + addonTotal - discount;
    return Object.assign(base, {
      quoteOnly: false,
      lines,
      frequency: freq === PRICING.frequency.once ? 'once' : freqId,
      needsFrequency: !!service.recurring && !PRICING.frequency[input.frequency || ''],
      subtotal,
      discount,
      total: subtotal + PRICING.travelFee,
      unit: service.unit || 'visit',
    });
  }

  // Total per visit (travel fee included), or null when it needs a custom quote.
  function estimatePrice(input) {
    const q = quote(input);
    return q && !q.quoteOnly ? q.total : null;
  }

  const api = { PRICING, quote, estimatePrice, money };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShinePricing = api;
})(this);

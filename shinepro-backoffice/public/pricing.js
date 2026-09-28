// Shared price calculator: used by the quote form in the browser AND by the
// server (so the saved estimate can't be tampered with). Edit prices here.
(function (root) {
  const PRICING = {
    services: {
      standard: { label: 'Standard Cleaning', base: 120 },
      deep: { label: 'Deep Cleaning', base: 200 },
      move: { label: 'Move In / Move Out', base: 250 },
      airbnb: { label: 'Airbnb / Rental Turnover', base: 110 },
      office: { label: 'Office / Commercial', base: 150 },
    },
    perBedroom: 25,
    perBathroom: 30,
    perSqftOver: { threshold: 1500, per1000: 40 },
    frequency: {
      once: { label: 'One time', discount: 0 },
      monthly: { label: 'Monthly', discount: 0.05 },
      biweekly: { label: 'Every 2 weeks', discount: 0.1 },
      weekly: { label: 'Weekly', discount: 0.15 },
    },
  };

  function estimatePrice(input) {
    const service = PRICING.services[input && input.service_type];
    if (!service) return null;
    const bedrooms = Math.max(0, Math.min(10, Number(input.bedrooms) || 0));
    const bathrooms = Math.max(0, Math.min(10, Number(input.bathrooms) || 0));
    const sqft = Math.max(0, Math.min(20000, Number(input.sqft) || 0));
    let price = service.base + bedrooms * PRICING.perBedroom + bathrooms * PRICING.perBathroom;
    if (sqft > PRICING.perSqftOver.threshold) {
      price += Math.ceil((sqft - PRICING.perSqftOver.threshold) / 1000) * PRICING.perSqftOver.per1000;
    }
    const freq = PRICING.frequency[input.frequency] || PRICING.frequency.once;
    price = price * (1 - freq.discount);
    return Math.round(price);
  }

  const api = { PRICING, estimatePrice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShinePricing = api;
})(this);

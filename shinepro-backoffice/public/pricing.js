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
    // Added once to a visit when the home is more than travelFreeMiles from
    // travelBase (straight-line distance), for every service, including each
    // recurring visit. Never discounted. Within that distance it shows as a
    // free line. When the distance isn't known yet, the fee is shown.
    travelFee: 25,
    travelFreeMiles: 5,
    travelBase: { lat: 40.4406, lon: -79.9959, label: 'Downtown Pittsburgh' },
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

    // Center of each ZIP code area we serve (US Census ZCTA centers, via the
    // MIT-licensed us-zips list), used to work out the distance from a ZIP.
    zipCenters: {"15001":[40.595,-80.323],"15003":[40.604,-80.216],"15004":[40.342,-80.383],"15005":[40.644,-80.186],"15006":[40.634,-79.877],"15007":[40.651,-79.932],"15009":[40.698,-80.365],"15010":[40.771,-80.351],"15012":[40.156,-79.813],"15014":[40.609,-79.742],"15015":[40.636,-80.082],"15017":[40.347,-80.133],"15018":[40.28,-79.8],"15019":[40.407,-80.329],"15020":[40.228,-79.954],"15021":[40.389,-80.442],"15022":[40.125,-79.939],"15024":[40.585,-79.847],"15025":[40.297,-79.921],"15026":[40.506,-80.357],"15027":[40.666,-80.24],"15028":[40.303,-79.803],"15030":[40.592,-79.783],"15031":[40.348,-80.162],"15033":[40.18,-79.865],"15034":[40.351,-79.89],"15035":[40.385,-79.807],"15037":[40.258,-79.853],"15038":[40.25,-79.926],"15042":[40.69,-80.205],"15043":[40.552,-80.488],"15044":[40.638,-79.948],"15045":[40.326,-79.886],"15046":[40.556,-80.229],"15047":[40.313,-79.796],"15049":[40.556,-79.804],"15050":[40.562,-80.444],"15051":[40.568,-79.861],"15052":[40.666,-80.427],"15053":[40.381,-80.36],"15054":[40.363,-80.397],"15055":[40.306,-80.124],"15056":[40.564,-80.216],"15057":[40.359,-80.244],"15059":[40.674,-80.509],"15060":[40.37,-80.289],"15061":[40.664,-80.308],"15062":[40.152,-79.883],"15063":[40.191,-79.922],"15064":[40.355,-80.148],"15065":[40.644,-79.725],"15066":[40.747,-80.256],"15067":[40.207,-79.962],"15068":[40.557,-79.726],"15071":[40.415,-80.19],"15072":[40.139,-79.856],"15074":[40.734,-80.208],"15075":[40.587,-79.827],"15076":[40.609,-79.837],"15077":[40.625,-80.417],"15078":[40.359,-80.385],"15081":[40.575,-80.236],"15082":[40.38,-80.211],"15083":[40.26,-79.786],"15084":[40.629,-79.803],"15085":[40.385,-79.725],"15086":[40.675,-80.109],"15087":[40.192,-79.851],"15088":[40.271,-79.896],"15089":[40.225,-79.749],"15090":[40.625,-80.067],"15101":[40.58,-79.955],"15102":[40.321,-80.037],"15104":[40.404,-79.862],"15106":[40.409,-80.109],"15108":[40.5,-80.202],"15110":[40.373,-79.85],"15112":[40.405,-79.837],"15116":[40.526,-79.934],"15120":[40.396,-79.908],"15122":[40.361,-79.896],"15123":[40.348,-79.935],"15126":[40.46,-80.287],"15129":[40.293,-79.995],"15131":[40.339,-79.796],"15132":[40.34,-79.843],"15133":[40.327,-79.867],"15135":[40.3,-79.812],"15136":[40.463,-80.107],"15137":[40.376,-79.809],"15139":[40.523,-79.836],"15140":[40.407,-79.778],"15142":[40.385,-80.122],"15143":[40.568,-80.147],"15144":[40.547,-79.783],"15145":[40.415,-79.824],"15146":[40.428,-79.761],"15147":[40.497,-79.831],"15148":[40.393,-79.795],"15201":[40.482,-79.942],"15202":[40.507,-80.072],"15203":[40.425,-79.976],"15204":[40.457,-80.061],"15205":[40.438,-80.106],"15206":[40.472,-79.913],"15207":[40.399,-79.935],"15208":[40.454,-79.899],"15209":[40.499,-79.97],"15210":[40.407,-79.985],"15211":[40.43,-80.015],"15212":[40.457,-79.995],"15213":[40.436,-79.964],"15214":[40.486,-80.013],"15215":[40.501,-79.913],"15216":[40.403,-80.035],"15217":[40.431,-79.92],"15218":[40.424,-79.89],"15219":[40.443,-79.984],"15220":[40.419,-80.049],"15221":[40.435,-79.866],"15222":[40.45,-79.991],"15223":[40.504,-79.951],"15224":[40.467,-79.946],"15225":[40.507,-80.114],"15226":[40.395,-80.014],"15227":[40.375,-79.971],"15228":[40.371,-80.044],"15229":[40.52,-80.039],"15232":[40.452,-79.932],"15233":[40.46,-80.033],"15234":[40.368,-80.018],"15235":[40.46,-79.822],"15236":[40.348,-79.976],"15237":[40.548,-80.046],"15238":[40.538,-79.879],"15239":[40.484,-79.738],"15241":[40.333,-80.083],"15243":[40.376,-80.071],"15260":[40.443,-79.953],"15275":[40.452,-80.184],"15282":[40.436,-79.991],"15290":[40.457,-80.019],"15301":[40.164,-80.252],"15642":[40.319,-79.724],"16066":[40.71,-80.106]},

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

  // Straight-line miles between two { lat, lon } points.
  function milesBetween(a, b) {
    const t = Math.PI / 180;
    const dLat = (b.lat - a.lat) * t;
    const dLon = (b.lon - a.lon) * t;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLon / 2) ** 2;
    return 2 * 3958.8 * Math.asin(Math.sqrt(h));
  }

  // Miles from the travel base, from map coordinates (an address picked from
  // the suggestions) or else the ZIP code. null when neither is known.
  function milesAway(input) {
    input = input || {};
    const lat = Number(input.lat);
    const lon = Number(input.lon);
    // Only coordinates in the Pittsburgh region count (guards against junk).
    if (input.lat != null && input.lon != null && lat > 39.5 && lat < 41.5 && lon > -81.5 && lon < -78.5) {
      return milesBetween(PRICING.travelBase, { lat, lon });
    }
    const zip = /\b(\d{5})(?:-\d{4})?\b/.exec(String(input.zip || ''));
    const c = zip && PRICING.zipCenters[zip[1]];
    return c ? milesBetween(PRICING.travelBase, { lat: c[0], lon: c[1] }) : null;
  }

  // The travel fee line for a visit: $0 within travelFreeMiles, otherwise travelFee.
  function travelLine(input) {
    const miles = milesAway(input);
    const free = miles != null && miles <= PRICING.travelFreeMiles;
    return {
      kind: 'travel',
      label: free ? `${PRICING.travelFeeLabel} — free within ${PRICING.travelFreeMiles} miles` : `${PRICING.travelFeeLabel} — ${money(PRICING.travelFee)}`,
      amount: free ? 0 : PRICING.travelFee,
      miles: miles == null ? null : Math.round(miles * 10) / 10,
    };
  }

  // Turns a request into an itemized estimate.
  // input: { service, size, frequency, addons: ['fridge', ...], organizingHours, zip, lat, lon }
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
    const travel = travelLine(input);
    const base = { service: serviceId, label: service.label, lines: [], travelFee: travel.amount, travelMiles: travel.miles };
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
      total: subtotal + travel.amount,
      unit: service.unit || 'visit',
    });
  }

  // Total per visit (travel fee included), or null when it needs a custom quote.
  function estimatePrice(input) {
    const q = quote(input);
    return q && !q.quoteOnly ? q.total : null;
  }

  const api = { PRICING, quote, estimatePrice, money, milesAway, travelLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShinePricing = api;
})(this);

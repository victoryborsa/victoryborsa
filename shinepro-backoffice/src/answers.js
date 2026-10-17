// Instant chat answers. These show up immediately (no AI wait):
//  - the preloaded questions customers can tap in the chat window
//  - typed messages, when the AI is not configured or fails, so customers
//    still get a real answer instead of "we got your message".
// Keep every answer in line with knowledge.md, and never quote prices.

function createAnswers(config) {
  const phone = config.businessPhone;
  const urgent = `If it's urgent, call or text us at ${phone}.`;

  // The preloaded questions, in the order they are shown.
  const QUESTIONS = [
    {
      id: 'price',
      label: 'How much does a cleaning cost?',
      answer: 'Every home is different, so we give you a price for your exact home and the team confirms it. How many bedrooms and bathrooms does your home have?',
    },
    {
      id: 'included',
      label: "What's included in a standard clean?",
      answer: 'A standard clean covers dusting, vacuuming and mopping, kitchen counters, stovetop and sink, full bathrooms (toilet, tub/shower, sink, mirrors), making beds and emptying trash. Would you like a one-time clean or regular visits?',
    },
    {
      id: 'deep',
      label: 'What is a deep clean?',
      answer: 'A deep clean is everything in a standard clean plus baseboards, door frames, light switches, inside the microwave, cabinet fronts and detailed scrubbing of kitchens and bathrooms. We recommend it for a first visit. How many bedrooms and bathrooms do you have?',
    },
    {
      id: 'move',
      label: 'Do you do move-in / move-out cleaning?',
      answer: 'Yes! We deep clean the empty home, including inside cabinets and closets. Inside the fridge and oven can be added. What date is your move?',
    },
    {
      id: 'area',
      label: 'What areas do you serve?',
      answer: "We clean homes in Pittsburgh and the surrounding communities. What's your ZIP code? We'll confirm we cover it.",
    },
    {
      id: 'when',
      label: 'When can you come?',
      answer: 'We clean Monday to Saturday, 8 AM to 6 PM. What day works best for you?',
    },
  ];

  // Keyword rules for typed messages, checked in order. Each one answers and
  // asks at most ONE follow-up question, like the AI does.
  const RULES = [
    { re: /\b(urgent|emergency|asap|right now|today)\b/i, answer: () => `We'll do our best to help quickly! Please call or text us at ${phone} so we can sort it out right away.` },
    { re: /\b(person|human|real (person|someone)|manager|owner|speak|talk to|call me|complain\w*|unhappy|upset|refund)\b/i, answer: () => `No problem! A team member will contact you shortly. ${urgent}` },
    { re: /\b\d+\s*(bed|br|bd)/i, answer: () => "Thanks! What's the ZIP code or address of the home? We'll confirm it's in our service area." },
    { re: /\b1[56]\d{3}\b/, answer: () => 'Great, thanks! What type of cleaning do you need: standard, deep, or move-in/move-out?' },
    { re: /\b(quotes?|estimates?)\b/i, answer: () => "Of course! What's the ZIP code or address of the home? We'll confirm it's in our service area." },
    { re: /\b(prices?|pricing|costs?|how much|rates?|charge)\b|\$/i, answer: () => QUESTIONS[0].answer },
    { re: /\b(airbnbs?|vrbo|rentals?|turnovers?|short[\s-]?term)\b/i, answer: () => 'Yes, we clean Airbnb and rental properties between guests, including changing linens. Where is the property located?' },
    { re: /\b(office|commercial|business|work ?space)\b/i, answer: () => 'Yes, we clean small offices, and larger spaces get a custom quote. Roughly how big is the space?' },
    { re: /\b(oven|fridge|refrigerator|windows?|laundry|cabinets?|dishes)\b/i, answer: () => 'Yes, we offer that as an add-on, and the team confirms the price. What type of cleaning would you like it added to?' },
    { re: /\bdeep\b/i, answer: () => QUESTIONS[2].answer },
    { re: /\bmov(e|ing)[\s-]?(in|out)?\b/i, answer: () => QUESTIONS[3].answer },
    { re: /\b(areas?|serve|service area|locat\w*|near|zip|neighborhoods?|travel)\b/i, answer: () => QUESTIONS[4].answer },
    { re: /\b(suppl\w*|products?|equipment|chemicals?|eco|green)\b/i, answer: () => 'We bring all our own supplies and equipment. If you prefer specific products, just tell us. Is there anything you would like us to use?' },
    { re: /\b(pets?|dogs?|cats?)\b/i, answer: () => "Pets are welcome! Just let us know about them before the visit. What type of cleaning do you need?" },
    { re: /\b(be (home|there)|keys?|door code)\b/i, answer: () => "You don't need to be home. Many customers leave a key or door code. Would you like to book a cleaning?" },
    { re: /\b(cancel\w*|reschedul\w*)\b/i, answer: () => `Please give us at least 24 hours' notice to cancel or reschedule. ${urgent}` },
    { re: /\b(pay\w*|cards?|cash|venmo|zelle)\b/i, answer: () => 'Payment is collected after the cleaning, and we accept cards and common payment apps. Can I help you book a cleaning?' },
    { re: /\b(insur\w*|background|trust\w*|safe)\b/i, answer: () => 'Our team is background-checked and insured. Would you like to book a cleaning?' },
    { re: /\b(when|availab\w*|hours|open|schedul\w*|book\w*|appointments?|tomorrow|saturday|sunday|monday|tuesday|wednesday|thursday|friday|weekends?)\b/i, answer: () => QUESTIONS[5].answer },
    { re: /\b(includ\w*|standard|regular|what do you (do|clean))\b/i, answer: () => QUESTIONS[1].answer },
    { re: /\b(clean\w*|house|home|apartment|condo)\b/i, answer: () => "We'd love to help! How many bedrooms and bathrooms does your home have?" },
    { re: /^\s*(hi|hello|hey|good (morning|afternoon|evening))\b/i, answer: () => 'Hi there! How can we help you today?' },
    { re: /\b(thanks?|thank you|thx|great|perfect|ok|okay)\b/i, answer: () => `You're welcome! A team member will follow up shortly to confirm everything. ${urgent}` },
  ];

  const fallback = `Thanks for your question! A team member will reply shortly. ${urgent}`;

  return {
    QUESTIONS,
    byId: (id) => QUESTIONS.find((q) => q.id === id) || null,
    // Returns { text, matched } — matched=false means we only had the generic reply.
    instant(message) {
      const rule = RULES.find((r) => r.re.test(message || ''));
      return rule ? { text: rule.answer(), matched: true } : { text: fallback, matched: false };
    },
  };
}

module.exports = { createAnswers };

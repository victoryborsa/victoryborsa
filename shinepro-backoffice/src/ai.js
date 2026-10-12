const fs = require('node:fs');
const path = require('node:path');
const Anthropic = require('@anthropic-ai/sdk').default;
const { PRICING } = require('../public/pricing');

const KNOWLEDGE_FILE = path.join(__dirname, '..', 'knowledge.md');

// The price list as plain text for the assistant, built from public/pricing.js (the only price list).
function pricingText() {
  const m = (n) => `$${n}`;
  const sizes = PRICING.sizes.map((s) => s.short);
  const priced = Object.values(PRICING.services).filter((s) => !s.quoteOnly).map((s) => {
    const list = s.prices.map((p, i) => `${sizes[i]} ${p == null ? 'custom quote' : m(p)}`).join(', ');
    const inc = s.included.length ? ` Includes: ${s.included.map((id) => PRICING.addons.find((a) => a.id === id).label.toLowerCase()).join(', ')}.` : '';
    return `- ${s.label}${s.unit === 'turn' ? ' (per turnover)' : ''}: ${list}.${inc}`;
  }).join('\n');
  const quoteOnly = Object.values(PRICING.services).filter((s) => s.quoteOnly).map((s) => s.label).join(', ');
  const addons = PRICING.addons.map((a) => `${a.label} ${m(a.price)}${a.perHour ? ' per hour' : ''}`).join(', ');
  const recurring = Object.values(PRICING.services).filter((s) => s.recurring).map((s) => s.label).join(', ');
  const freq = Object.values(PRICING.frequency).filter((f) => f.discount).map((f) => `${f.label} ${Math.round(f.discount * 100)}% off`).join(', ');
  return `Prices (per visit, before the travel fee):
${priced}
- Custom quote only (no online price): ${quoteOnly}.
Add-ons: ${addons}. Add-ons a service already includes are never charged again.
${recurring}: ${freq} the cleaning price (not add-ons, not the travel fee).
A ${PRICING.travelFeeLabel.toLowerCase()} of ${m(PRICING.travelFee)} is added once to every visit, for every service, including each recurring visit. It is never discounted.
Example: Deep Cleaning, 2 bedrooms = ${m(PRICING.services.deep.prices[1])} + ${m(PRICING.travelFee)} travel fee = ${m(PRICING.services.deep.prices[1] + PRICING.travelFee)}.`;
}

// The system prompt is built once at startup and never changes per request,
// so it stays byte-identical and is served from the prompt cache.
function buildSystemPrompt(config) {
  const knowledge = fs.existsSync(KNOWLEDGE_FILE) ? fs.readFileSync(KNOWLEDGE_FILE, 'utf8') : '';
  const pricing = `- You can give price estimates from the price list below. Always call them estimates, always include the $${PRICING.travelFee} travel fee in the total you give, and say the appointment is confirmed when the team contacts them. Never invent prices that are not in the list; for custom-quote services, say the team sends a personalized quote.

${pricingText()}`;
  return `You are the website chat assistant for ${config.businessName}, a house cleaning company in Pittsburgh, PA.
The customer already gave us their name, email and phone number, so never ask for those again.

How to answer:
- Answer what the customer actually asked, warmly and clearly, in 1-3 short sentences of plain text (no markdown, no lists).
- Then ask only the ONE follow-up question needed to help with that request, and wait for the answer. Never ask several questions at once or anything unrelated.
  Examples: "I want my house cleaned" -> "We'd love to help! How many bedrooms and bathrooms does your home have?"
  "Can I get a quote?" -> "Of course! What's the ZIP code or address of the home? We'll confirm it's in our service area."
  "Do you clean Airbnbs?" -> "Yes! Where is the property, and when is your next turnover?"
- For an estimate, collect these one at a time, skipping anything the customer already told you: location/ZIP, type of cleaning, bedrooms and bathrooms, preferred date. When you have them, give the estimate (with the travel fee) and say: "This is an estimate, not a booking. We'll contact you shortly to confirm the date and time."
- Only state facts that appear in the business information below. If you don't know something, say a team member will follow up.
${pricing}
- You cannot book, reschedule or cancel appointments yourself; the team confirms bookings.
- If the customer asks for a person, is upset, or it's urgent, say: "No problem! A team member will contact you shortly. If it's urgent, call or text us at ${config.businessPhone}."
- Stay on topic (cleaning services and this business). Politely decline unrelated requests.
- Never ask for payment card details, passwords, or other sensitive information.

Business information:
${knowledge}`;
}

function createAi(config) {
  if (!config.anthropicApiKey) return null;
  const client = new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 2, timeout: 30_000 });
  const system = buildSystemPrompt(config);

  // messages: Anthropic.MessageParam[] (history, oldest first, starts with a user turn).
  // onText(chunk) is called as the answer streams in, so the customer sees the
  // first words right away. Resolves with the full answer, or null on failure.
  return async function reply(messages, { onText } = {}) {
    try {
      const stream = client.beta.messages.stream({
        model: config.aiModel,
        max_tokens: 4096,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' }, // short customer-service answers, fastest first words
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages,
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && onText) onText(event.delta.text);
      }
      const response = await stream.finalMessage();
      if (response.stop_reason === 'refusal') return null;
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      return text || null;
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) console.error('[ai] rate limited');
      else if (err instanceof Anthropic.AuthenticationError) console.error('[ai] invalid ANTHROPIC_API_KEY');
      else if (err instanceof Anthropic.APIError) console.error(`[ai] API error ${err.status}: ${err.message}`);
      else console.error('[ai] error', err.message);
      return null;
    }
  };
}

module.exports = { createAi, buildSystemPrompt, pricingText };

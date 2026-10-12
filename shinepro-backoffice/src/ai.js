const fs = require('node:fs');
const path = require('node:path');
const Anthropic = require('@anthropic-ai/sdk').default;
const { PRICING } = require('../public/pricing');

const KNOWLEDGE_FILE = path.join(__dirname, '..', 'knowledge.md');

// The system prompt is built once at startup and never changes per request,
// so it stays byte-identical and is served from the prompt cache.
function buildSystemPrompt(config) {
  const knowledge = fs.existsSync(KNOWLEDGE_FILE) ? fs.readFileSync(KNOWLEDGE_FILE, 'utf8') : '';
  const services = Object.values(PRICING.services).map((s) => `- ${s.label}: starts at $${s.base}`).join('\n');
  const freq = Object.values(PRICING.frequency).map((f) => `- ${f.label}: ${Math.round(f.discount * 100)}% off each visit`).join('\n');
  const pricing = config.priceSource === 'package'
    ? `- You can give price estimates using the pricing rules below. Always call them estimates; the team confirms the final price.

Pricing rules (estimates, per visit):
${services}
- Add $${PRICING.perBedroom} per bedroom and $${PRICING.perBathroom} per bathroom.
- Homes over ${PRICING.perSqftOver.threshold} sq ft: add $${PRICING.perSqftOver.per1000} per extra 1,000 sq ft (or part of it).
Recurring discounts:
${freq}`
    : `- Do NOT state any specific prices or dollar amounts, even if asked, unless they appear in the business information below. For a price, explain the team confirms a price for their exact home and start collecting the estimate details.`;

  return `You are the website chat assistant for ${config.businessName}, a house cleaning company in Pittsburgh, PA.
The customer already gave us their name, email and phone number, so never ask for those again.

How to answer:
- Answer what the customer actually asked, warmly and clearly, in 1-3 short sentences of plain text (no markdown, no lists).
- Then ask only the ONE follow-up question needed to help with that request, and wait for the answer. Never ask several questions at once or anything unrelated.
  Examples: "I want my house cleaned" -> "We'd love to help! How many bedrooms and bathrooms does your home have?"
  "Can I get a quote?" -> "Of course! What's the ZIP code or address of the home? We'll confirm it's in our service area."
  "Do you clean Airbnbs?" -> "Yes! Where is the property, and when is your next turnover?"
- For an estimate, collect these one at a time, skipping anything the customer already told you: location/ZIP, type of cleaning, bedrooms and bathrooms, preferred date. When you have them, say: "Thanks! We have everything we need. We'll contact you shortly to confirm the details and your price."
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

module.exports = { createAi, buildSystemPrompt };
